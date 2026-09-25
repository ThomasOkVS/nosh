import type { Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GeminiExtractFn,
  GeminiTranslateFn,
  GeminiVideoExtractFn,
} from "../llm/geminiClient";
import { VideoTooLargeError, VideoUnavailableError, type SocialVideoDownloadFn } from "../services/socialVideo";
import { recoverImportJobs } from "../repositories/importJobs";
import type { SendPushFn } from "../services/pushNotifier";
import { createTestApp } from "../test/app";
import { getTestPool } from "../test/db";

async function signedInAgent(
  app: Express,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  const username = email.split("@")[0]!;
  await agent.post("/auth/signup").send({ email, username, password: "correct-horse" });
  return agent;
}

function fakeGemini(recipe: unknown): GeminiExtractFn {
  return vi.fn().mockResolvedValue(recipe);
}

function fakeGeminiVideo(recipe: unknown): GeminiVideoExtractFn {
  return vi.fn().mockResolvedValue(recipe);
}

function fakeVideoDownload(
  result: { videoBuffer: Buffer; mimeType: string; caption: string | null } | Error,
): SocialVideoDownloadFn {
  return result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result);
}

const FAKE_VIDEO = { videoBuffer: Buffer.from("fake"), mimeType: "video/mp4", caption: "caption text" };

/** The route always fetches via the global `fetch` (no per-request injection
 * point, unlike `recipeExtraction`'s own unit tests) — stub it globally here
 * so these route tests never hit the network. */
function stubFetchWithHtml(html: string): void {
  vi.stubGlobal(
    "fetch",
    // A fresh Response per call — a body can only be read once, and some
    // tests import more than once.
    vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(html, { headers: { "content-type": "text/html" } })),
    ),
  );
}

interface ImportJobBody {
  id: number;
  collectionId: number | null;
  status: "running" | "done" | "error" | "cancelled";
  seenStages: string[];
  recipe: Record<string, unknown> | null;
  imageUrl: string | null;
  translationSkipped: boolean;
  errorStatus: number | null;
  errorMessage: string | null;
  reviewed: boolean;
}

type Agent = ReturnType<typeof request.agent>;

/** Starts an import and polls until the background job settles — the same
 * thing the frontend does, just without the one-second interval. */
async function importAndWait(agent: Agent, url: string): Promise<ImportJobBody> {
  const started = await agent.post("/import").send({ url });
  expect(started.status).toBe(202);
  return waitForJob(agent, (started.body as ImportJobBody).id);
}

async function waitForJob(agent: Agent, id: number): Promise<ImportJobBody> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await agent.get(`/import/${id}`);
    const job = res.body as ImportJobBody;
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Import job ${id} never finished`);
}

const RECIPE_JSON_LD_PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@type": "Recipe",
  name: "Tomato Soup",
  recipeIngredient: ["1 kg tomatoes"],
  recipeInstructions: ["Simmer the tomatoes"],
})}</script></head><body></body></html>`;

describe("import routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects requests with no session", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const res = await request(createTestApp({ geminiExtract: fakeGemini({}) }))
      .post("/import")
      .send({ url: "https://example.com" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with a 400 and creates no job", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp({ geminiExtract: fakeGemini({}) });
    const agent = await signedInAgent(app, "importinvalid@example.com");

    const res = await agent.post("/import").send({ url: "not a url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect((await agent.get("/import")).body).toEqual([]);
  });

  it("answers 202 with a running job, which finishes with its stages and the recipe", async () => {
    stubFetchWithHtml("<html><body>No recipe markup here</body></html>");
    const app = createTestApp({
      geminiExtract: fakeGemini({
        title: "Tomato Soup",
        ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
        steps: [{ instruction: "Simmer" }],
      }),
    });
    const agent = await signedInAgent(app, "importsuccess@example.com");

    const started = await agent.post("/import").send({ url: "https://example.com/recipe" });
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ status: "running", recipe: null });

    const job = await waitForJob(agent, started.body.id);
    expect(job.status).toBe("done");
    expect(job.seenStages).toEqual(["fetching", "structured-data", "ai"]);
    expect(job.recipe!.title).toBe("Tomato Soup");
    expect(job.recipe!.sourceUrl).toBe("https://example.com/recipe");
  });

  it("uses the model saved on the Settings page, and automatic otherwise", async () => {
    stubFetchWithHtml("<html><body>No recipe markup here</body></html>");
    const geminiExtract = fakeGemini({
      title: "Tomato Soup",
      ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
    });
    const app = createTestApp({ geminiExtract });
    const agent = await signedInAgent(app, "importmodel@example.com");

    await importAndWait(agent, "https://example.com/recipe");
    await agent.put("/settings/magic-import").send({ model: "other-model" });
    await importAndWait(agent, "https://example.com/recipe");

    const models = vi.mocked(geminiExtract).mock.calls.map((call) => call[2]?.model);
    expect(models).toEqual([undefined, "other-model"]);
  });

  it("imports in the language and units saved on the Settings page", async () => {
    stubFetchWithHtml(`<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "Pancakes",
      recipeIngredient: ["1 cup milk"],
      recipeInstructions: ["Heat the pan and cook the batter until golden, then flip it over."],
    })}</script></head><body></body></html>`);
    const geminiTranslate: GeminiTranslateFn = vi.fn().mockResolvedValue({
      title: "Pannenkoeken",
      ingredients: [{ quantity: "1", unit: "cup", name: "melk" }],
      steps: [{ instruction: "Verwarm de pan en bak het beslag goudbruin, draai het dan om." }],
    });
    const app = createTestApp({ geminiTranslate });
    const agent = await signedInAgent(app, "importprefs@example.com");
    await agent.put("/settings/recipe-preferences").send({ language: "nl", unitSystem: "metric" });

    const job = await importAndWait(agent, "https://example.com/pancakes");

    expect(vi.mocked(geminiTranslate).mock.calls[0]?.[1]).toBe("nl");
    expect(job.seenStages).toEqual(["fetching", "structured-data", "translating"]);
    expect(job.recipe!.title).toBe("Pannenkoeken");
    expect(job.recipe!.ingredients).toEqual([{ quantity: "236.59", unit: "ml", name: "melk" }]);
    expect(job.translationSkipped).toBe(false);
  });

  it("flags a job whose translation couldn't happen", async () => {
    stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
    const app = createTestApp();
    const agent = await signedInAgent(app, "importnotranslator@example.com");
    await agent.put("/settings/recipe-preferences").send({ language: "nl" });

    const job = await importAndWait(agent, "https://example.com/recipe");

    expect(job.status).toBe("done");
    expect(job.recipe!.title).toBe("Tomato Soup");
    expect(job.translationSkipped).toBe(true);
  });

  it("stops at the structured-data stage when the page has JSON-LD", async () => {
    stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
    const geminiExtract = fakeGemini({});
    const app = createTestApp({ geminiExtract });
    const agent = await signedInAgent(app, "importjsonld@example.com");

    const job = await importAndWait(agent, "https://example.com/recipe");

    expect(job.seenStages).toEqual(["fetching", "structured-data"]);
    expect(job.recipe!.title).toBe("Tomato Soup");
    expect(geminiExtract).not.toHaveBeenCalled();
  });

  it("imports a JSON-LD page with no Gemini configured at all", async () => {
    stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
    const app = createTestApp();
    const agent = await signedInAgent(app, "importnokey@example.com");

    const job = await importAndWait(agent, "https://example.com/recipe");
    expect(job.recipe!.title).toBe("Tomato Soup");
  });

  it("fails the job with a 503 when the fallback is needed but unconfigured", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp();
    const agent = await signedInAgent(app, "importunconfigured@example.com");

    const job = await importAndWait(agent, "https://example.com/recipe");
    expect(job).toMatchObject({ status: "error", errorStatus: 503 });
  });

  it("fails the job with a 422 when no recipe can be extracted", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp({ geminiExtract: fakeGemini({ title: "" }) });
    const agent = await signedInAgent(app, "import422@example.com");

    const job = await importAndWait(agent, "https://example.com/recipe");
    expect(job).toMatchObject({ status: "error", errorStatus: 422 });
  });

  it("rejects a blocked URL with a real 400 before creating a job, without fetching it", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp({ geminiExtract: fakeGemini({}) });
    const agent = await signedInAgent(app, "importbadurl@example.com");

    // The dockge-on-the-host-gateway case from the homelab's threat model.
    const res = await agent.post("/import").send({ url: "http://172.28.0.1:5001/" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "This URL cannot be imported" });
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("social video import (Instagram/TikTok)", () => {
    it("downloads the video and records its stages before the result", async () => {
      const downloadSocialVideo = fakeVideoDownload(FAKE_VIDEO);
      const geminiVideoExtract = fakeGeminiVideo({
        title: "Fajitas",
        ingredients: [{ quantity: "200", unit: "g", name: "chicken thigh" }],
        steps: [{ instruction: "Bake at 200C for 20 minutes" }],
      });
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract });
      const agent = await signedInAgent(app, "importreel@example.com");

      const job = await importAndWait(agent, "https://www.instagram.com/p/abc123/");

      expect(job.seenStages).toEqual(["downloading-video", "analyzing-video"]);
      expect(job.status).toBe("done");
      expect(job.recipe!.title).toBe("Fajitas");
      expect(job.recipe!.sourceUrl).toBe("https://www.instagram.com/p/abc123/");
      expect(geminiVideoExtract).toHaveBeenCalledWith(
        { buffer: FAKE_VIDEO.videoBuffer, mimeType: FAKE_VIDEO.mimeType },
        FAKE_VIDEO.caption,
        "https://www.instagram.com/p/abc123/",
        expect.anything(),
      );
    });

    it("works the same for a TikTok URL", async () => {
      const downloadSocialVideo = fakeVideoDownload(FAKE_VIDEO);
      const geminiVideoExtract = fakeGeminiVideo({ title: "Noodles", ingredients: [], steps: [] });
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract });
      const agent = await signedInAgent(app, "importtiktok@example.com");

      const job = await importAndWait(agent, "https://www.tiktok.com/@chef/video/123");
      expect(job.recipe!.title).toBe("Noodles");
    });

    it("fails the job with a 503 when no AI is configured, without downloading anything", async () => {
      const downloadSocialVideo = fakeVideoDownload(FAKE_VIDEO);
      const app = createTestApp({ downloadSocialVideo });
      const agent = await signedInAgent(app, "importreelnokey@example.com");

      const job = await importAndWait(agent, "https://www.instagram.com/p/abc123/");
      expect(job).toMatchObject({ status: "error", errorStatus: 503 });
      expect(downloadSocialVideo).not.toHaveBeenCalled();
    });

    it("fails the job with a 502 when the post can't be fetched (private/deleted/blocked)", async () => {
      const downloadSocialVideo = fakeVideoDownload(new VideoUnavailableError("nope"));
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract: fakeGeminiVideo({}) });
      const agent = await signedInAgent(app, "importreelprivate@example.com");

      const job = await importAndWait(agent, "https://www.instagram.com/p/abc123/");
      expect(job).toMatchObject({ status: "error", errorStatus: 502 });
    });

    it("fails the job with a 422 when the video is too long/large", async () => {
      const downloadSocialVideo = fakeVideoDownload(new VideoTooLargeError("too long"));
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract: fakeGeminiVideo({}) });
      const agent = await signedInAgent(app, "importreeltoolong@example.com");

      const job = await importAndWait(agent, "https://www.instagram.com/p/abc123/");
      expect(job).toMatchObject({ status: "error", errorStatus: 422 });
    });
  });

  describe("job lifecycle", () => {
    /** A download that never finishes on its own — only an abort ends it —
     * so a test can observe a job while it's still running. */
    const hangingDownload: SocialVideoDownloadFn = (_url, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });

    it("lists running and unreviewed jobs as pending until marked reviewed", async () => {
      stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
      const app = createTestApp();
      const agent = await signedInAgent(app, "importpending@example.com");

      const job = await importAndWait(agent, "https://example.com/recipe");
      const pending = await agent.get("/import");
      expect(pending.body.map((j: ImportJobBody) => j.id)).toEqual([job.id]);

      expect((await agent.post(`/import/${job.id}/reviewed`)).status).toBe(204);
      expect((await agent.get("/import")).body).toEqual([]);
      expect((await agent.get(`/import/${job.id}`)).body.reviewed).toBe(true);
    });

    it("keeps the folder the import was started from on the job", async () => {
      stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
      const app = createTestApp();
      const agent = await signedInAgent(app, "importfolder@example.com");
      const folder = await agent.post("/collections").send({ name: "Soups" });

      const started = await agent
        .post("/import")
        .send({ url: "https://example.com/recipe", collectionId: folder.body.id });
      expect(started.status).toBe(202);
      const job = await waitForJob(agent, started.body.id);
      expect(job).toMatchObject({ status: "done", collectionId: folder.body.id });
    });

    it("refuses to file an import in another user's folder", async () => {
      const app = createTestApp();
      const owner = await signedInAgent(app, "importfolderowner@example.com");
      const other = await signedInAgent(app, "importfolderother@example.com");
      const folder = await owner.post("/collections").send({ name: "Mine" });

      const res = await other
        .post("/import")
        .send({ url: "https://example.com/recipe", collectionId: folder.body.id });
      expect(res.status).toBe(404);
      expect((await other.get("/import")).body).toEqual([]);
    });

    it("hides another user's jobs", async () => {
      stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
      const app = createTestApp();
      const owner = await signedInAgent(app, "importowner@example.com");
      const other = await signedInAgent(app, "importother@example.com");

      const job = await importAndWait(owner, "https://example.com/recipe");
      expect((await other.get(`/import/${job.id}`)).status).toBe(404);
      expect((await other.post(`/import/${job.id}/reviewed`)).status).toBe(404);
      expect((await other.get("/import")).body).toEqual([]);
    });

    it("cancels a running job, aborting its work and dropping it from pending", async () => {
      const app = createTestApp({
        downloadSocialVideo: hangingDownload,
        geminiVideoExtract: fakeGeminiVideo({}),
      });
      const agent = await signedInAgent(app, "importcancel@example.com");

      const started = await agent.post("/import").send({ url: "https://www.instagram.com/p/abc123/" });
      expect((await agent.post(`/import/${started.body.id}/cancel`)).status).toBe(204);

      const job = await waitForJob(agent, started.body.id);
      expect(job.status).toBe("cancelled");
      expect((await agent.get("/import")).body).toEqual([]);
    });

    it("marks jobs left running by a previous process as failed on recovery", async () => {
      const app = createTestApp({
        downloadSocialVideo: hangingDownload,
        geminiVideoExtract: fakeGeminiVideo({}),
      });
      const agent = await signedInAgent(app, "importrecover@example.com");
      const started = await agent.post("/import").send({ url: "https://www.instagram.com/p/abc123/" });

      // Stands in for a restart: the row is still "running", but as far as
      // a fresh process is concerned nothing is working on it.
      await recoverImportJobs(getTestPool());

      const job = (await agent.get(`/import/${started.body.id}`)).body as ImportJobBody;
      expect(job.status).toBe("error");
      expect(job.errorMessage).toMatch(/interrupted/);
      await agent.post(`/import/${started.body.id}/cancel`); // let the hanging fake settle
    });
  });

  describe("push notifications", () => {
    async function subscribe(agent: Agent, endpoint: string): Promise<void> {
      const res = await agent
        .post("/push/subscriptions")
        .send({ endpoint, keys: { p256dh: "p256dh-key", auth: "auth-secret" } });
      expect(res.status).toBe(204);
    }

    /** The notification is sent after the job's final write, so a poll can
     * see "done" a moment before the push goes out. */
    async function waitForCalls(fn: ReturnType<typeof vi.fn>, count: number): Promise<void> {
      for (let attempt = 0; attempt < 200 && fn.mock.calls.length < count; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    it("notifies every subscribed device when an import finishes, linking to the review form", async () => {
      stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
      const sendPush = vi.fn<SendPushFn>().mockResolvedValue(undefined);
      const app = createTestApp({ vapidPublicKey: "test-public-key", sendPush });
      const agent = await signedInAgent(app, "importpush@example.com");
      await subscribe(agent, "https://web.push.apple.com/phone");
      await subscribe(agent, "https://fcm.googleapis.com/fcm/send/laptop");

      const job = await importAndWait(agent, "https://example.com/recipe");
      await waitForCalls(sendPush, 2);

      expect(sendPush.mock.calls.map(([sub]) => sub.endpoint).sort()).toEqual([
        "https://fcm.googleapis.com/fcm/send/laptop",
        "https://web.push.apple.com/phone",
      ]);
      expect(sendPush.mock.calls[0]![1]).toEqual({
        title: "Recipe ready",
        body: "Tomato Soup — tap to review and save it.",
        url: `/recipes/new?importId=${job.id}`,
      });
    });

    it("notifies about failures too", async () => {
      stubFetchWithHtml("<html><body>No recipe</body></html>");
      const sendPush = vi.fn<SendPushFn>().mockResolvedValue(undefined);
      const app = createTestApp({ vapidPublicKey: "test-public-key", sendPush });
      const agent = await signedInAgent(app, "importpushfail@example.com");
      await subscribe(agent, "https://web.push.apple.com/phone");

      await importAndWait(agent, "https://example.com/recipe");
      await waitForCalls(sendPush, 1);

      expect(sendPush.mock.calls[0]![1]).toMatchObject({ title: "Import failed", url: "/" });
    });

    it("never sends to a stored endpoint that isn't a known push service, and deletes it", async () => {
      stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
      const sendPush = vi.fn<SendPushFn>().mockResolvedValue(undefined);
      const app = createTestApp({ vapidPublicKey: "test-public-key", sendPush });
      const agent = await signedInAgent(app, "importpushbad@example.com");
      await subscribe(agent, "https://web.push.apple.com/phone");
      await subscribe(agent, "https://fcm.googleapis.com/fcm/send/laptop");
      // Stands in for a row stored before endpoints were validated.
      await getTestPool().query(
        `UPDATE push_subscriptions SET endpoint = 'http://172.28.0.1:5001/api' WHERE endpoint LIKE '%apple%'`,
      );

      await importAndWait(agent, "https://example.com/recipe");
      await waitForCalls(sendPush, 1);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendPush.mock.calls.map(([sub]) => sub.endpoint)).toEqual([
        "https://fcm.googleapis.com/fcm/send/laptop",
      ]);
      const rows = await getTestPool().query<{ endpoint: string }>("SELECT endpoint FROM push_subscriptions");
      expect(rows.rows.map((row) => row.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/laptop"]);
    });

    it("forgets a subscription the push service reports as gone", async () => {
      stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
      const gone = Object.assign(new Error("Gone"), { statusCode: 410 });
      const sendPush = vi.fn<SendPushFn>().mockRejectedValueOnce(gone).mockResolvedValue(undefined);
      const app = createTestApp({ vapidPublicKey: "test-public-key", sendPush });
      const agent = await signedInAgent(app, "importpushgone@example.com");
      await subscribe(agent, "https://web.push.apple.com/phone");

      await importAndWait(agent, "https://example.com/recipe");
      await waitForCalls(sendPush, 1);
      // Give the cleanup DELETE a moment to land after the rejected send.
      await new Promise((resolve) => setTimeout(resolve, 50));
      await importAndWait(agent, "https://example.com/recipe");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendPush).toHaveBeenCalledTimes(1);
    });
  });
});

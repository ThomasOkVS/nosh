import type { RecipeDto } from "@nosh/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { deferred, owner, server } from "../../test/msw";
import { imageDto, recipeDto } from "../../test/recipes";
import { renderApp } from "../../test/render";

const png = (name: string) => new File(["x"], name, { type: "image/png" });

let realFetch: typeof fetch;
let fetchSpy: MockInstance<typeof fetch>;
let created: string[] = [];
let revoked: string[] = [];
// jsdom has no object URLs: these are put back (or removed again) after each test.
const realCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const realRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

function restore(key: "createObjectURL" | "revokeObjectURL", original: PropertyDescriptor | undefined) {
  if (original) Object.defineProperty(URL, key, original);
  else Reflect.deleteProperty(URL, key);
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  fetchSpy = vi.spyOn(globalThis, "fetch");
  created = [];
  revoked = [];
  URL.createObjectURL = vi.fn((file: Blob) => {
    const url = `blob:${(file as File).name}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  // Unmount first (this hook runs before the global cleanup): a preview's
  // effect cleanup still revokes its object URL through the stub.
  cleanup();
  vi.restoreAllMocks();
  restore("createObjectURL", realCreateObjectURL);
  restore("revokeObjectURL", realRevokeObjectURL);
});

/** The recipe as the server holds it; tests change it as the server would. */
function serve(initial: RecipeDto) {
  const state = { recipe: initial };
  server.use(
    http.get("/api/auth/me", () => HttpResponse.json(owner)),
    http.get("/api/recipes/:id", ({ params }) =>
      String(state.recipe.id) === params.id
        ? HttpResponse.json(state.recipe)
        : HttpResponse.json({ error: "Recipe not found" }, { status: 404 }),
    ),
  );
  return state;
}

const plain = recipeDto({ id: 5, title: "Stoverij" });
const covered = recipeDto({
  id: 5,
  title: "Stoverij",
  images: [imageDto(5, 9)],
  coverImageId: 9,
});

async function openEdit(recipe: RecipeDto) {
  const app = renderApp(`/recipes/${recipe.id}/edit`);
  await screen.findByRole("heading", { level: 1, name: "Edit recipe" });
  await screen.findByDisplayValue(recipe.title);
  return app;
}

async function openNew() {
  const app = renderApp("/recipes/new");
  await screen.findByRole("heading", { level: 1, name: "New recipe" });
  return app;
}

/** The hidden file input behind the drop area. */
const fileInput = () => screen.getByLabelText(/choose a photo/i) as HTMLInputElement;

/** Records each upload's file name; answers with image 10 as the new cover. */
function acceptUpload(state: { recipe: RecipeDto }, id = 5) {
  server.use(
    http.post(`/api/recipes/${id}/images`, async () => {
      state.recipe = { ...state.recipe, images: [imageDto(id, 10)], coverImageId: 10 };
      return HttpResponse.json(imageDto(id, 10), { status: 201 });
    }),
  );
  return uploadedNames;
}

/** The file names sent to any images endpoint, read from the fetch calls (msw cannot parse jsdom's FormData). */
function uploadedNames(): string[] {
  return fetchSpy.mock.calls
    .filter(([url, init]) => String(url).endsWith("/images") && init?.method === "POST")
    .map(([, init]) => ((init?.body as FormData).get("file") as File).name);
}

/** One toast is one node with its text; this fails on none and on a duplicate. */
async function expectOneToast(text: string) {
  await screen.findByText(text);
  // Let a second toast, if any, land before counting.
  await new Promise((r) => setTimeout(r, 150));
  expect(screen.getAllByText(text)).toHaveLength(1);
}

describe("form photo section", () => {
  it("REC-33: the Photo section states the accepted types", async () => {
    serve(plain);
    await openNew();
    expect(screen.getByRole("heading", { level: 2, name: "Photo" })).toBeInTheDocument();
    expect(screen.getByText("JPEG, PNG, WEBP or HEIC")).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif",
    );
  });

  it("REC-33: choosing or dropping several files takes only the first", async () => {
    serve(plain);
    await openNew();
    fireEvent.change(fileInput(), { target: { files: [png("a.png"), png("b.png")] } });
    expect(await screen.findByRole("img", { name: "Chosen photo" })).toHaveAttribute("src", "blob:a.png");

    fireEvent.drop(screen.getByTestId("photo-drop"), {
      dataTransfer: { files: [png("c.png"), png("d.png")] },
    });
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Chosen photo" })).toHaveAttribute("src", "blob:c.png"),
    );
    expect(created).not.toContain("blob:d.png");
  });

  it("REC-33: on the edit form with no cover, the chosen photo is uploaded at once and shown", async () => {
    const state = serve(plain);
    acceptUpload(state);
    const { user } = await openEdit(plain);

    await user.upload(fileInput(), png("new.png"));

    await waitFor(() => expect(uploadedNames()).toEqual(["new.png"]));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Cover photo" })).toHaveAttribute(
      "src",
      "/api/recipes/5/images/10",
    );
  });

  it("REC-33: a photo uploaded on the edit form keeps the unsaved text edits", async () => {
    const state = serve(plain);
    acceptUpload(state);
    const { user } = await openEdit(plain);
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Edited but not saved");

    await user.upload(fileInput(), png("new.png"));

    await screen.findByRole("img", { name: "Cover photo" });
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Edited but not saved");
  });

  it("REC-33: while uploading the area shows Uploading… in a polite live region and is disabled", async () => {
    const state = serve(plain);
    acceptUpload(state);
    // jsdom's FormData cannot be held mid-flight through msw, so hold the POST here.
    const hold = deferred();
    fetchSpy.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/images") && init?.method === "POST") {
        await hold.promise;
        state.recipe = { ...state.recipe, images: [imageDto(5, 10)], coverImageId: 10 };
        return Response.json(imageDto(5, 10), { status: 201 });
      }
      return realFetch(input, init);
    });
    const { user } = await openEdit(plain);

    await user.upload(fileInput(), png("new.png"));

    expect(await screen.findByText("Uploading…")).toHaveAttribute("aria-live", "polite");
    expect(fileInput()).toBeDisabled();
    hold.resolve();
    await screen.findByRole("img", { name: "Cover photo" });
    expect(screen.queryByText("Uploading…")).not.toBeInTheDocument();
    expect(fileInput()).toBeEnabled();
  });

  it("REC-33: on the edit form with a cover, it asks before replacing; Cancel uploads nothing", async () => {
    serve(covered);
    const { user } = await openEdit(covered);

    await user.upload(fileInput(), png("new.png"));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Replace this photo?")).toBeInTheDocument();
    expect(within(dialog).getByText("The current one will be deleted.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(uploadedNames()).toEqual([]);
    expect(screen.getByRole("img", { name: "Cover photo" })).toHaveAttribute(
      "src",
      "/api/recipes/5/images/9",
    );
  });

  it("REC-33: confirming Replace uploads the new photo", async () => {
    const state = serve(covered);
    acceptUpload(state);
    const { user } = await openEdit(covered);

    await user.upload(fileInput(), png("new.png"));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Replace" }));

    await waitFor(() => expect(uploadedNames()).toEqual(["new.png"]));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Cover photo" })).toHaveAttribute(
        "src",
        "/api/recipes/5/images/10",
      ),
    );
  });

  it("REC-33: a failed upload keeps the cover and shows the server's reason", async () => {
    serve(covered);
    server.use(
      http.post("/api/recipes/5/images", () =>
        HttpResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 }),
      ),
    );
    const { user } = await openEdit(covered);

    await user.upload(fileInput(), png("big.png"));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Replace" }));

    await expectOneToast("Image must be 5 MB or smaller");
    expect(screen.getByRole("img", { name: "Cover photo" })).toHaveAttribute(
      "src",
      "/api/recipes/5/images/9",
    );
    expect(fileInput()).toBeEnabled();
  });

  it("REC-33: a failed upload with no reason says Failed to upload image", async () => {
    serve(plain);
    server.use(http.post("/api/recipes/5/images", () => new HttpResponse("oops", { status: 500 })));
    const { user } = await openEdit(plain);

    await user.upload(fileInput(), png("a.png"));

    await expectOneToast("Failed to upload image");
    expect(screen.queryByRole("img", { name: "Cover photo" })).not.toBeInTheDocument();
  });

  it("REC-33: on the create form the photo is a preview; another choice replaces it without asking; the old URL is revoked", async () => {
    serve(plain);
    const { user } = await openNew();

    await user.upload(fileInput(), png("one.png"));
    expect(await screen.findByRole("img", { name: "Chosen photo" })).toHaveAttribute("src", "blob:one.png");

    await user.upload(fileInput(), png("two.png"));
    expect(await screen.findByRole("img", { name: "Chosen photo" })).toHaveAttribute("src", "blob:two.png");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(revoked).toContain("blob:one.png");
  });

  it("REC-33: on the create form, Remove photo clears the preview, revokes its URL and a save uploads nothing", async () => {
    const state = serve(recipeDto({ id: 42, title: "Soup" }));
    server.use(http.post("/api/recipes", () => HttpResponse.json(state.recipe, { status: 201 })));
    acceptUpload(state, 42);
    const { user, router } = await openNew();

    await user.upload(fileInput(), png("gone.png"));
    await screen.findByRole("img", { name: "Chosen photo" });
    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(screen.queryByRole("img", { name: "Chosen photo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(revoked).toContain("blob:gone.png");

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Soup");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/42"));
    expect(uploadedNames()).toEqual([]);
  });

  it("REC-33: a HEIC choice shows the Photo selected tile instead of a preview", async () => {
    serve(plain);
    const { user } = await openNew();

    await user.upload(fileInput(), new File(["x"], "IMG_1.HEIC", { type: "image/heic" }));

    expect(await screen.findByText("Photo selected: IMG_1.HEIC")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Chosen photo" })).not.toBeInTheDocument();
  });

  it("REC-33: the chosen photo is uploaded right after the create, then the owner lands on the recipe", async () => {
    const state = serve(recipeDto({ id: 42, title: "Soup" }));
    server.use(
      http.post("/api/recipes", async ({ request }) => {
        const body = (await request.json()) as { title: string };
        state.recipe = recipeDto({ id: 42, title: body.title });
        return HttpResponse.json(state.recipe, { status: 201 });
      }),
    );
    acceptUpload(state, 42);
    const { user, router } = await openNew();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Soup");
    await user.upload(fileInput(), png("soup.png"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/42"));
    expect(uploadedNames()).toEqual(["soup.png"]);
    expect(revoked).toContain("blob:soup.png");
  });

  it("REC-33: when the upload after a create fails, the recipe stays saved, the reason shows and it lands on the recipe", async () => {
    const state = serve(recipeDto({ id: 42, title: "Soup" }));
    server.use(
      http.post("/api/recipes", () => HttpResponse.json(state.recipe, { status: 201 })),
      http.post("/api/recipes/42/images", () =>
        HttpResponse.json({ error: "Unsupported image type" }, { status: 400 }),
      ),
    );
    const { user, router } = await openNew();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Soup");
    await user.upload(fileInput(), png("big.png"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await expectOneToast("Unsupported image type");
    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/42"));
  });

  it("REC-33: a create with no photo chosen uploads nothing", async () => {
    const state = serve(recipeDto({ id: 42, title: "Soup" }));
    server.use(http.post("/api/recipes", () => HttpResponse.json(state.recipe, { status: 201 })));
    acceptUpload(state, 42);
    const { user, router } = await openNew();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Soup");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/42"));
    expect(uploadedNames()).toEqual([]);
  });

  it("REC-34: remove asks first; Cancel keeps the photo", async () => {
    const state = serve(covered);
    const deletes: string[] = [];
    server.use(
      http.delete("/api/recipes/5/images/:imageId", ({ params }) => {
        deletes.push(String(params.imageId));
        state.recipe = { ...state.recipe, images: [], coverImageId: null };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await openEdit(covered);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove this photo?")).toBeInTheDocument();
    expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deletes).toEqual([]);
    expect(screen.getByRole("img", { name: "Cover photo" })).toBeInTheDocument();
  });

  it("REC-34: confirming deletes the cover and leaves the section empty", async () => {
    const state = serve(covered);
    const deletes: string[] = [];
    server.use(
      http.delete("/api/recipes/5/images/:imageId", ({ params }) => {
        deletes.push(String(params.imageId));
        state.recipe = { ...state.recipe, images: [], coverImageId: null };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await openEdit(covered);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(deletes).toEqual(["9"]));
    await waitFor(() => expect(screen.queryByRole("img", { name: "Cover photo" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
  });

  it("REC-34: a failed delete shows Failed to delete image and keeps the photo", async () => {
    serve(covered);
    server.use(
      http.delete("/api/recipes/5/images/:imageId", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const { user } = await openEdit(covered);

    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));

    await expectOneToast("Failed to delete image");
    expect(screen.getByRole("img", { name: "Cover photo" })).toBeInTheDocument();
  });
});

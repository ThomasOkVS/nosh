import { afterEach, describe, expect, it, vi } from "vitest";
import { createSocialVideoDownloader } from "./socialVideo";

// A separate file because it replaces node:child_process for the whole
// module graph (vi.mock is hoisted above the imports): this checks the *real*
// runner, which the other socialVideo tests bypass by injecting `run`.
const execFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile }));

describe("the real yt-dlp runner", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("runs /usr/bin/yt-dlp with --proxy and an environment with no proxy variables", async () => {
    // Against the real yt-dlp, NO_PROXY=* alone was enough to make it ignore
    // --proxy — this is the line that stops that.
    process.env.NO_PROXY = "*";
    process.env.no_proxy = "*";
    process.env.HTTPS_PROXY = "http://evil:3128";
    process.env.NOSH_UNRELATED = "kept";
    execFile.mockImplementation(
      (_file: string, args: string[], _options: unknown, callback: (...a: unknown[]) => void) => {
        callback(null, args.includes("--dump-json") ? '{"duration": 10}' : Buffer.from("mp4"), "");
      },
    );

    const download = createSocialVideoDownloader({ proxyUrl: "http://127.0.0.1:41234" });
    await download(new URL("https://www.instagram.com/reel/abc/"));

    expect(execFile).toHaveBeenCalledTimes(2);
    for (const [file, args, options] of execFile.mock.calls as [string, string[], { env: object }][]) {
      expect(file).toBe("/usr/bin/yt-dlp");
      expect(args).toContain("--proxy");
      expect(Object.keys(options.env).filter((name) => /_proxy$/i.test(name))).toEqual([]);
      expect(options.env).toHaveProperty("NOSH_UNRELATED", "kept");
    }
  });
});

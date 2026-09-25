import { describe, expect, it, vi } from "vitest";
import {
  createSocialVideoDownloader,
  detectSocialPlatform,
  DownloaderUnavailableError,
  VideoUnavailableError,
  wrapYtDlpError,
  ytDlpEnv,
  type YtDlpRunner,
} from "./socialVideo";

describe("detectSocialPlatform", () => {
  it.each([
    ["https://www.instagram.com/p/abc123/", "instagram"],
    ["https://instagram.com/reel/abc123/", "instagram"],
    ["https://www.tiktok.com/@chef/video/123", "tiktok"],
    ["https://vm.tiktok.com/abc123/", "tiktok"],
    ["https://vt.tiktok.com/abc123/", "tiktok"],
    ["https://m.tiktok.com/v/123.html", "tiktok"],
  ])("recognizes %s as %s", (url, platform) => {
    expect(detectSocialPlatform(new URL(url))).toBe(platform);
  });

  it.each([
    "https://example.com/recipe",
    "https://youtube.com/watch?v=abc",
    // A hostname that merely contains the platform name isn't a match —
    // otherwise "instagram.com.evil.example" style lookalikes would route
    // straight into the video pipeline.
    "https://instagram.com.evil.example/p/abc/",
    "https://notinstagram.com/p/abc/",
  ])("does not treat %s as a social video URL", (url) => {
    expect(detectSocialPlatform(new URL(url))).toBeNull();
  });
});

describe("wrapYtDlpError", () => {
  it("maps a missing binary to DownloaderUnavailableError", () => {
    const err = wrapYtDlpError(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    expect(err).toBeInstanceOf(DownloaderUnavailableError);
  });

  it("maps a killed/aborted process to a timeout message", () => {
    const err = wrapYtDlpError(Object.assign(new Error("killed"), { killed: true }));
    expect(err).toBeInstanceOf(VideoUnavailableError);
    expect(err.message).toMatch(/timed out/i);
  });

  it("maps any other failure to a generic unavailable message, not the raw stderr", () => {
    const err = wrapYtDlpError(
      Object.assign(new Error("exit 1"), { stderr: "ERROR: [Instagram] This account is private" }),
    );
    expect(err).toBeInstanceOf(VideoUnavailableError);
    expect(err.message).not.toContain("ERROR:");
  });
});

describe("createSocialVideoDownloader", () => {
  const PROXY_URL = "http://127.0.0.1:41234";

  function fakeRunner(): ReturnType<typeof vi.fn<YtDlpRunner>> {
    return vi.fn<YtDlpRunner>(async (args) =>
      args.includes("--dump-json")
        ? JSON.stringify({ duration: 30, description: "A caption", thumbnail: "https://cdn.test/t.jpg" })
        : Buffer.from("fake mp4 bytes"),
    );
  }

  it("routes every yt-dlp invocation through the egress proxy", async () => {
    const run = fakeRunner();
    const download = createSocialVideoDownloader({ proxyUrl: PROXY_URL, run });

    await download(new URL("https://www.instagram.com/reel/abc/"));

    expect(run).toHaveBeenCalledTimes(2);
    for (const [args] of run.mock.calls) {
      const proxyFlag = args.indexOf("--proxy");
      expect(proxyFlag).toBeGreaterThanOrEqual(0);
      expect(args[proxyFlag + 1]).toBe(PROXY_URL);
      // No config file may override --proxy, and no download may be handed
      // to ffmpeg, which would fetch the URL itself without the proxy.
      expect(args).toContain("--ignore-config");
      expect(args.join(" ")).toContain("--downloader native");
      expect(args.join(" ")).toContain("--fixup never");
      expect(args.join(" ")).toContain("--ies default,-generic");
      // The post URL is last, after every option.
      expect(args.at(-1)).toBe("https://www.instagram.com/reel/abc/");
    }
  });

  it("returns the video, caption and thumbnail", async () => {
    const download = createSocialVideoDownloader({ proxyUrl: PROXY_URL, run: fakeRunner() });
    await expect(download(new URL("https://www.tiktok.com/@chef/video/1"))).resolves.toMatchObject({
      mimeType: "video/mp4",
      caption: "A caption",
      thumbnailUrl: "https://cdn.test/t.jpg",
    });
  });
});

describe("ytDlpEnv", () => {
  it("drops every proxy variable, in either case, and keeps the rest", () => {
    expect(
      ytDlpEnv({
        PATH: "/usr/bin",
        HOME: "/home/node",
        NO_PROXY: "172.28.0.1",
        no_proxy: "*",
        HTTP_PROXY: "http://evil:3128",
        https_proxy: "http://evil:3128",
        ALL_PROXY: "socks5://evil:1080",
      }),
    ).toEqual({ PATH: "/usr/bin", HOME: "/home/node" });
  });
});

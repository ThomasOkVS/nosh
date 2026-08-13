import { describe, expect, it } from "vitest";
import {
  detectSocialPlatform,
  DownloaderUnavailableError,
  VideoUnavailableError,
  wrapYtDlpError,
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

import { execFile } from "node:child_process";

// Absolute path rather than a bare "yt-dlp" resolved through $PATH — the
// bare form would run whatever binary a writable-and-earlier PATH entry
// happens to provide, not necessarily the one apk installed. This is where
// apk actually puts it in the image (see Dockerfile/Dockerfile.dev).
const YT_DLP_PATH = "/usr/bin/yt-dlp";

/** The post itself couldn't be fetched — private, deleted, geo-blocked, or
 * the platform is throttling/blocking automated requests. Distinct from "we
 * fetched it and there's no recipe in it", which is decided later by Gemini. */
export class VideoUnavailableError extends Error {}
/** The clip is longer or larger than we're willing to send to the model —
 * checked up front (duration) and after download (byte length), so a
 * multi-minute video doesn't get downloaded only to be rejected. */
export class VideoTooLargeError extends Error {}
/** yt-dlp itself isn't runnable (missing binary, bad PATH). Distinct from
 * "not configured" for Gemini — this is an environment problem, not a
 * missing API key. */
export class DownloaderUnavailableError extends Error {}

export type SocialPlatform = "instagram" | "tiktok";

const PLATFORM_HOSTS: Record<SocialPlatform, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"],
};

/**
 * Recognizes the URL as a Reels/TikTok link worth routing to the video
 * pipeline, rather than validating it's safe to fetch — yt-dlp does its own
 * fetching against a small set of known platform hosts, not arbitrary
 * user-supplied endpoints, so this is a routing check, not the SSRF guard
 * `recipeExtraction.ts` applies to plain URL imports.
 */
export function detectSocialPlatform(url: URL): SocialPlatform | null {
  const hostname = url.hostname.toLowerCase();
  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS) as [SocialPlatform, string[]][]) {
    if (hosts.includes(hostname)) return platform;
  }
  return null;
}

// Generous for a Reel/TikTok (almost all are under 90s) but cheap to check
// before spending any bandwidth on the actual video.
const MAX_DURATION_SECONDS = 3 * 60;
// Comfortably under Gemini's inline-data request-size ceiling once base64
// overhead (~33%) and the prompt text are accounted for.
const MAX_VIDEO_BYTES = 18 * 1024 * 1024;
const YT_DLP_TIMEOUT_MS = 45_000;

export interface DownloadedVideo {
  videoBuffer: Buffer;
  mimeType: string;
  caption: string | null;
  /** yt-dlp's own thumbnail URL for the post, if it reported one — lets the
   * import flow auto-attach a photo without any extra request beyond the
   * metadata call already made below. */
  thumbnailUrl: string | null;
}

export type SocialVideoDownloadFn = (url: URL, signal?: AbortSignal) => Promise<DownloadedVideo>;

interface YtDlpInfo {
  duration?: number;
  description?: string | null;
  thumbnail?: string | null;
}

/** yt-dlp's stderr has the real reason (private account, deleted post,
 * unsupported URL) but its wording varies by platform and version — logged
 * for debugging rather than pattern-matched into the user-facing message,
 * for the same reason Gemini's raw error body is logged but not surfaced. */
export function wrapYtDlpError(err: unknown): Error {
  const nodeErr = err as (Error & { code?: string; killed?: boolean; stderr?: string }) | undefined;
  if (nodeErr?.code === "ENOENT") {
    return new DownloaderUnavailableError("The video downloader is not available on this server");
  }
  if (nodeErr?.killed || nodeErr?.name === "AbortError") {
    return new VideoUnavailableError("Timed out fetching that post");
  }
  console.error("yt-dlp failed:", nodeErr?.stderr?.slice(0, 1000) ?? nodeErr?.message);
  return new VideoUnavailableError(
    "Couldn't fetch that post — it may be private, deleted, or currently blocked",
  );
}

function runYtDlpText(args: string[], signal: AbortSignal | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      YT_DLP_PATH,
      args,
      { timeout: YT_DLP_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024, signal },
      (err, stdout, stderr) => {
        if (err) {
          reject(Object.assign(err, { stderr }));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** Video bytes come back over stdout (`-o -`) rather than a temp file —
 * yt-dlp writes progress/status to stderr in this mode specifically so it
 * doesn't corrupt the media on stdout. */
function runYtDlpBuffer(args: string[], signal: AbortSignal | undefined): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      YT_DLP_PATH,
      args,
      { timeout: YT_DLP_TIMEOUT_MS, maxBuffer: MAX_VIDEO_BYTES + 5 * 1024 * 1024, encoding: "buffer", signal },
      (err, stdout, stderr) => {
        if (err) {
          reject(Object.assign(err, { stderr: stderr?.toString() }));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function fetchVideoInfo(url: URL, signal: AbortSignal | undefined): Promise<YtDlpInfo> {
  try {
    const stdout = await runYtDlpText(
      ["--dump-json", "--no-warnings", "--no-playlist", url.toString()],
      signal,
    );
    return JSON.parse(stdout) as YtDlpInfo;
  } catch (err) {
    throw wrapYtDlpError(err);
  }
}

async function fetchVideoBytes(url: URL, signal: AbortSignal | undefined): Promise<Buffer> {
  try {
    return await runYtDlpBuffer(
      [
        // Keeps the file small enough for Gemini's inline-data limit without
        // a hard --max-filesize cutoff, which would abort mid-download
        // rather than degrading quality first.
        "-f",
        "best[height<=480]/best",
        // Forces a single consistent container so the caller never has to
        // sniff the format — Instagram/TikTok both serve pre-muxed mp4
        // formats at this resolution, so this never triggers an ffmpeg remux.
        "--merge-output-format",
        "mp4",
        "-o",
        "-",
        "--no-warnings",
        "--no-playlist",
        url.toString(),
      ],
      signal,
    );
  } catch (err) {
    throw wrapYtDlpError(err);
  }
}

/**
 * Downloads a Reel/TikTok's video and caption via yt-dlp. Two subprocess
 * calls rather than one: metadata first (near-instant, no video bytes) so an
 * over-long video is rejected before spending any bandwidth downloading it.
 */
export async function downloadSocialVideo(url: URL, signal?: AbortSignal): Promise<DownloadedVideo> {
  const info = await fetchVideoInfo(url, signal);
  if (typeof info.duration === "number" && info.duration > MAX_DURATION_SECONDS) {
    throw new VideoTooLargeError("That video is too long to import");
  }

  const videoBuffer = await fetchVideoBytes(url, signal);
  if (videoBuffer.length === 0) {
    throw new VideoUnavailableError("Couldn't download that video");
  }
  if (videoBuffer.length > MAX_VIDEO_BYTES) {
    throw new VideoTooLargeError("That video is too large to import");
  }

  const caption =
    typeof info.description === "string" && info.description.trim() ? info.description.trim() : null;
  const thumbnailUrl =
    typeof info.thumbnail === "string" && info.thumbnail.trim() ? info.thumbnail.trim() : null;
  return { videoBuffer, mimeType: "video/mp4", caption, thumbnailUrl };
}

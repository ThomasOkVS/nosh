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
/** yt-dlp itself isn't runnable (missing binary, bad PATH, no egress proxy).
 * Distinct from "not configured" for Gemini — this is an environment
 * problem, not a missing API key. */
export class DownloaderUnavailableError extends Error {}

export type SocialPlatform = "instagram" | "tiktok";

const PLATFORM_HOSTS: Record<SocialPlatform, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"],
};

/**
 * Recognizes the URL as a Reels/TikTok link worth routing to the video
 * pipeline. A routing check, not the SSRF guard: that is applied to every
 * connection yt-dlp makes, by the egress proxy (see ytDlpSafetyArgs).
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

/**
 * yt-dlp does its own networking, so every invocation is pointed at the
 * in-process egress proxy (egressProxy.ts), which applies safeFetch.ts's
 * address guard to each connection yt-dlp opens — redirects, API calls and
 * CDN media included. On top of that:
 *  - `--ignore-config`: a yt-dlp config file on the box could otherwise set
 *    its own `--proxy` (or `--proxy ""`) and route around this one.
 *  - `--downloader native`: yt-dlp hands some formats (HLS/DASH) to ffmpeg to
 *    download, and ffmpeg makes its own connections, ignoring the proxy.
 *    The native downloaders use yt-dlp's own HTTP stack, i.e. the proxy.
 *  - `--fixup never`: no ffmpeg post-processing either. The format string
 *    never merges (no `+`), so nothing else runs ffmpeg.
 *  - `--ies default,-generic`: only the site-specific extractors (Instagram,
 *    TikTok) remain — not the one that crawls an arbitrary page.
 */
export function ytDlpSafetyArgs(proxyUrl: string): string[] {
  return [
    "--ignore-config",
    "--proxy",
    proxyUrl,
    "--downloader",
    "native",
    "--fixup",
    "never",
    "--no-warnings",
    "--no-playlist",
    "--ies",
    "default,-generic",
  ];
}

const PROXY_ENV_VAR = /^(?:http|https|all|no|ftp|socks)_proxy$/i;

/** The environment yt-dlp runs with: the backend's own, minus every proxy
 * variable. `--proxy` alone is not enough: checked against Alpine's yt-dlp
 * 2026.07.04, `NO_PROXY=*` in the environment makes it skip an explicit
 * `--proxy` entirely and connect directly. So none of them get through. */
export function ytDlpEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !PROXY_ENV_VAR.test(name)));
}

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

/** Runs yt-dlp and resolves with its stdout. Injectable so tests can see
 * exactly which arguments every invocation gets, without the real binary. */
export type YtDlpRunner = (
  args: string[],
  options: { encoding: "utf8" | "buffer"; maxBuffer: number; signal: AbortSignal | undefined },
) => Promise<string | Buffer>;

const runYtDlp: YtDlpRunner = (args, { encoding, maxBuffer, signal }) =>
  new Promise((resolve, reject) => {
    execFile(
      YT_DLP_PATH,
      args,
      { timeout: YT_DLP_TIMEOUT_MS, maxBuffer, encoding, signal, env: ytDlpEnv() },
      (err, stdout, stderr) => {
        if (err) {
          // Attach stderr to `err` in place, then reject with the bare `err`
          // identifier — some static analyzers can't tell that
          // Object.assign(err, ...)'s return value is still that same Error
          // instance, and flag rejecting with it as if it might not be one.
          Object.assign(err, { stderr: stderr.toString() });
          reject(err);
          return;
        }
        resolve(stdout);
      },
    );
  });

export interface SocialVideoDownloaderOptions {
  /** The egress proxy's URL. Required: there is no way to build a
   * downloader whose yt-dlp talks to the network directly. */
  proxyUrl: string;
  run?: YtDlpRunner;
}

/**
 * Builds the Reel/TikTok downloader (video + caption via yt-dlp). Two
 * subprocess calls rather than one: metadata first (near-instant, no video
 * bytes) so an over-long video is rejected before spending any bandwidth
 * downloading it.
 *
 * Video bytes come back over stdout (`-o -`) rather than a temp file —
 * yt-dlp writes progress/status to stderr in this mode specifically so it
 * doesn't corrupt the media on stdout.
 */
export function createSocialVideoDownloader({
  proxyUrl,
  run = runYtDlp,
}: SocialVideoDownloaderOptions): SocialVideoDownloadFn {
  const safetyArgs = ytDlpSafetyArgs(proxyUrl);

  async function fetchVideoInfo(url: URL, signal: AbortSignal | undefined): Promise<YtDlpInfo> {
    try {
      const stdout = await run(["--dump-json", ...safetyArgs, url.toString()], {
        encoding: "utf8",
        maxBuffer: 5 * 1024 * 1024,
        signal,
      });
      return JSON.parse(stdout.toString()) as YtDlpInfo;
    } catch (err) {
      throw wrapYtDlpError(err);
    }
  }

  async function fetchVideoBytes(url: URL, signal: AbortSignal | undefined): Promise<Buffer> {
    try {
      const stdout = await run(
        [
          // Keeps the file small enough for Gemini's inline-data limit
          // without a hard --max-filesize cutoff, which would abort
          // mid-download rather than degrading quality first. Single-file
          // formats only (no `+`), so yt-dlp never needs ffmpeg to merge —
          // Instagram/TikTok both serve pre-muxed mp4 at this resolution.
          "-f",
          "best[height<=480]/best",
          "-o",
          "-",
          ...safetyArgs,
          url.toString(),
        ],
        { encoding: "buffer", maxBuffer: MAX_VIDEO_BYTES + 5 * 1024 * 1024, signal },
      );
      return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    } catch (err) {
      throw wrapYtDlpError(err);
    }
  }

  return async (url, signal) => {
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
  };
}

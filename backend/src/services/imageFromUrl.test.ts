import { describe, expect, it, vi } from "vitest";
import { InvalidUrlError } from "./recipeExtraction";
import {
  fetchImageFromUrl,
  ImageFetchError,
  ImageTooLargeError,
  UnsupportedImageTypeError,
} from "./imageFromUrl";

function imageResponse(
  body: Buffer | string,
  init: { status?: number; contentType?: string; contentLength?: number } = {},
): Response {
  const headers: Record<string, string> = { "content-type": init.contentType ?? "image/jpeg" };
  if (init.contentLength !== undefined) headers["content-length"] = String(init.contentLength);
  return new Response(body, { status: init.status ?? 200, headers });
}

describe("fetchImageFromUrl", () => {
  it("fetches an allowed image URL and reports its extension", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse(Buffer.from("fake-bytes")));

    const result = await fetchImageFromUrl("https://example.com/soup.jpg", fetchImpl);
    expect(result.extension).toBe(".jpg");
    expect(result.buffer.toString()).toBe("fake-bytes");
  });

  it.each([
    ["image/png", ".png"],
    ["image/webp", ".webp"],
  ])("maps %s to %s", async (contentType, extension) => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse(Buffer.from("x"), { contentType }));
    const result = await fetchImageFromUrl("https://example.com/soup", fetchImpl);
    expect(result.extension).toBe(extension);
  });

  it("rejects an unsupported content type", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(imageResponse("<svg/>", { contentType: "image/svg+xml" }));

    await expect(fetchImageFromUrl("https://example.com/soup.svg", fetchImpl)).rejects.toThrow(
      UnsupportedImageTypeError,
    );
  });

  it("rejects a blocked host before making any request", async () => {
    const fetchImpl = vi.fn();

    await expect(fetchImageFromUrl("http://192.168.1.1/x.jpg", fetchImpl)).rejects.toThrow(
      InvalidUrlError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a redirect into a blocked host", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/x.jpg" } }),
    );

    await expect(fetchImageFromUrl("https://example.com/x.jpg", fetchImpl)).rejects.toThrow(
      InvalidUrlError,
    );
  });

  it("follows a redirect to an allowed host", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://cdn.example.com/x.jpg" } }),
      )
      .mockResolvedValueOnce(imageResponse(Buffer.from("fake")));

    const result = await fetchImageFromUrl("https://example.com/x.jpg", fetchImpl);
    expect(result.extension).toBe(".jpg");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects an image declared too large via content-length", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(imageResponse(Buffer.alloc(10), { contentLength: 100 * 1024 * 1024 }));

    await expect(fetchImageFromUrl("https://example.com/huge.jpg", fetchImpl)).rejects.toThrow(
      ImageTooLargeError,
    );
  });

  it("rejects an image that exceeds the cap while streaming, despite no content-length", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1);
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse(oversized));

    await expect(fetchImageFromUrl("https://example.com/huge.jpg", fetchImpl)).rejects.toThrow(
      ImageTooLargeError,
    );
  });

  it("throws ImageFetchError on a non-2xx status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse("not found", { status: 404 }));

    await expect(fetchImageFromUrl("https://example.com/missing.jpg", fetchImpl)).rejects.toThrow(
      ImageFetchError,
    );
  });

  it("throws ImageFetchError when the fetch itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(fetchImageFromUrl("https://example.com/x.jpg", fetchImpl)).rejects.toThrow(
      ImageFetchError,
    );
  });

  it("throws ImageFetchError after too many redirects", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://example.com/next.jpg" } }),
      );

    await expect(fetchImageFromUrl("https://example.com/x.jpg", fetchImpl)).rejects.toThrow(
      ImageFetchError,
    );
  });
});

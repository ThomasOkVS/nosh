import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/lib/queryClient";
import { server } from "../../test/msw";
import { useAttachCoverFromUrl, useUploadCover } from "./api";

// The fetch spy is put back even when an assertion fails.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("recipe mutations", () => {
  it("REC-14: uploads the photo as a POST with multipart field file and reports a refusal's message", async () => {
    server.use(
      http.post("/api/recipes/7/images", () =>
        HttpResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 }),
      ),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = createQueryClient({ test: true });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadCover(7), { wrapper });
    const file = new File(["x"], "a.png", { type: "image/png" });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.isError).toBe(true));
    const call = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/api/recipes/7/images"));
    expect(call).toBeDefined();
    const init = call?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBe(file);
    expect(new Headers(init?.headers).has("content-type")).toBe(false);
    expect(result.current.error?.message).toBe("Image must be 5 MB or smaller");
  });

  it("REC-18: attaches a photo from a URL as a JSON POST and reports the server's message", async () => {
    server.use(
      http.post("/api/recipes/7/images/from-url", () =>
        HttpResponse.json({ error: "That URL isn't a supported image" }, { status: 422 }),
      ),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = createQueryClient({ test: true });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAttachCoverFromUrl(7), { wrapper });

    result.current.mutate("https://photos.example.com/soup.png");

    await waitFor(() => expect(result.current.isError).toBe(true));
    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url instanceof Request ? url.url : url).endsWith("/api/recipes/7/images/from-url"),
    );
    expect(call).toBeDefined();
    const [input, init] = call ?? [];
    const request = new Request(input instanceof Request ? input : new URL(String(input), "http://x"), init);
    expect(request.method).toBe("POST");
    expect(await request.json()).toEqual({ url: "https://photos.example.com/soup.png" });
    expect(result.current.error?.message).toBe("That URL isn't a supported image");
    expect(result.current.error).toMatchObject({ status: 422 });
  });
});

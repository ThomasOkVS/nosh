import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "@/lib/queryClient";
import { server } from "../../test/msw";
import { useUploadCover } from "./api";

describe("recipe mutations", () => {
  it("REC-14: uploads the photo as multipart field file and reports a refusal's message", async () => {
    let contentType = "";
    server.use(
      http.post("/api/recipes/7/images", async ({ request }) => {
        contentType = request.headers.get("content-type") ?? "";
        return HttpResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 });
      }),
    );
    const client = createQueryClient({ test: true });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadCover(7), { wrapper });

    result.current.mutate(new File(["x"], "a.png", { type: "image/png" }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(result.current.error?.message).toBe("Image must be 5 MB or smaller");
  });
});

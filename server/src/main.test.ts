import { createServer } from "node:net";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { start } from "./main.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://nosh:nosh@localhost:5433/nosh_test";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
let running: { close(): Promise<void> } | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe("start", () => {
  it("SEC-57: refuses to boot in production without SESSION_SECRET", async () => {
    await expect(
      start({
        NODE_ENV: "production",
        DATABASE_URL: TEST_URL,
        ALLOWED_ORIGINS: "https://nosh.example.com",
        TRUSTED_PROXIES: "172.20.0.2",
      }),
    ).rejects.toThrow(/SESSION_SECRET/);
  });

  it("migrates, listens and stops on close", async () => {
    const port = await freePort();
    running = await start({ DATABASE_URL: TEST_URL, PORT: String(port) });
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });

    await running.close();
    running = undefined;
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });
});

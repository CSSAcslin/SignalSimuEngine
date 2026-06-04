import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAnalysisBackendStatus } from "../src/signal";

describe("analysis backend status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports online when the local analysis health endpoint responds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })));

    await expect(checkAnalysisBackendStatus()).resolves.toEqual({ status: "online", message: "Local analysis backend online" });
  });

  it("reports offline when the local analysis service cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));

    await expect(checkAnalysisBackendStatus()).resolves.toMatchObject({
      status: "offline",
      message: expect.stringContaining("pnpm backend:dev")
    });
  });
});

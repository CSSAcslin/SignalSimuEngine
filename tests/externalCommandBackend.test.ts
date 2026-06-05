import { afterEach, describe, expect, it, vi } from "vitest";
import { createExternalCommandRequest, runExternalCommandBackend } from "../src/signal";

describe("external command backend bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a protocol request with multiple input signals and node parameters", () => {
    const request = createExternalCommandRequest(
      {
        id: "external",
        name: "External Command",
        type: "operation",
        kind: "externalCommand",
        position: { x: 0, y: 0 },
        timelineOffset: 0,
        params: { executablePath: "processor.exe", arguments: "--input {input} --output {output}", timeoutMs: 1000, p0: 2 }
      },
      [
        { id: "a", name: "A", sampleRate: 100, unit: "a.u.", time: [0, 0.01], values: [1, 2], params: {} },
        { id: "b", name: "B", sampleRate: 100, unit: "a.u.", time: [0, 0.01], values: [3, 4], params: {} }
      ]
    );

    expect(request).toMatchObject({
      nodeId: "external",
      executablePath: "processor.exe",
      sampleRate: 100,
      params: { p0: 2 }
    });
    expect(request.inputs).toHaveLength(2);
    expect(request.inputs[1].values).toEqual([3, 4]);
  });

  it("explains that browser sessions cannot directly run executable modules", async () => {
    const result = await runExternalCommandBackend({
      nodeId: "external",
      name: "External Command",
      executablePath: "processor.exe",
      arguments: "--input {input} --output {output}",
      timeoutMs: 1000,
      sampleRate: 100,
      inputs: [],
      params: {}
    });

    expect(result).toMatchObject({
      type: "external-command-error",
      status: "error"
    });
    if (result.type !== "external-command-error") throw new Error("Expected external command error.");
    expect(result.message).toContain("desktop shell");
  });

  it("runs through the Tauri command when the desktop shell is available", async () => {
    const invoke = vi.fn(async () => ({
      type: "signal",
      values: [2, 4],
      unit: "a.u.",
      warnings: ["ok"],
      metadata: { tool: "demo" }
    }));
    Object.defineProperty(window, "__TAURI__", {
      value: { core: { invoke } },
      configurable: true
    });

    const result = await runExternalCommandBackend({
      nodeId: "external",
      name: "External Command",
      executablePath: "processor.exe",
      arguments: "--input {input} --output {output}",
      timeoutMs: 1000,
      sampleRate: 100,
      inputs: [],
      params: {}
    });

    expect(invoke).toHaveBeenCalledWith("run_external_command_module", expect.objectContaining({
      request: expect.objectContaining({ executablePath: "processor.exe" })
    }));
    expect(result).toMatchObject({
      type: "signal",
      values: [2, 4],
      unit: "a.u."
    });
  });
});

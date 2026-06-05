import { describe, expect, it } from "vitest";
import { moduleDefinitions } from "../src/signal";

describe("module definitions", () => {
  it("uses sine phase instead of a separate cosine source", () => {
    expect(moduleDefinitions.some((definition) => String(definition.kind) === "cosine")).toBe(false);
    expect(moduleDefinitions.some((definition) => definition.kind === "triangle")).toBe(true);
    expect(moduleDefinitions.some((definition) => definition.kind === "gaussianPulse")).toBe(true);
  });

  it("declares first-stage analysis modules as analysis outputs", () => {
    const analysisKinds = ["fft", "rms", "quantiles", "distribution", "snr", "dominantFrequency", "bandwidth", "stft", "cwt"];

    analysisKinds.forEach((kind) => {
      const definition = moduleDefinitions.find((item) => item.kind === kind);
      expect(definition?.type).toBe("analysis");
      expect(definition?.outputType).toBe(kind === "stft" || kind === "cwt" ? "time-frequency" : kind === "fft" ? "spectrum" : kind === "distribution" ? "distribution" : kind === "quantiles" ? "summary" : "scalar");
    });
    expect(moduleDefinitions.some((definition) => definition.kind === "mean")).toBe(false);
    expect(moduleDefinitions.some((definition) => definition.kind === "peak")).toBe(false);
  });

  it("declares safe custom expression module templates", () => {
    const customSource = moduleDefinitions.find((definition) => definition.kind === "customSource");
    const customExpression = moduleDefinitions.find((definition) => definition.kind === "customExpression");
    const externalCommand = moduleDefinitions.find((definition) => definition.kind === "externalCommand");

    expect(customSource).toMatchObject({ type: "source", label: "Custom Source", inputCount: 0 });
    expect(customExpression).toMatchObject({ type: "operation", label: "Custom Expression", inputCount: "many" });
    expect(externalCommand).toMatchObject({ type: "operation", label: "External Command", inputCount: "many" });
    expect(customSource?.params.some((param) => param.key === "expression" && param.type === "text")).toBe(true);
    expect(customExpression?.params.some((param) => param.key === "expression" && param.type === "text")).toBe(true);
    expect(externalCommand?.params.some((param) => param.key === "executablePath" && param.type === "text")).toBe(true);
    expect(moduleDefinitions.some((definition) => String(definition.kind) === "customUnary")).toBe(false);
  });
});

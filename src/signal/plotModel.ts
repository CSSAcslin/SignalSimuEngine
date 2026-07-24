import type { AnalysisResult, Signal, SignalDomain } from "./types";

export type PlotAxis = {
  kind: "time" | "delay" | "sample" | "frequency" | "value";
  label: string;
  unit: string;
  linkToMaster: boolean;
};

export type ScientificPlotModel =
  | { kind: "line"; id: string; title: string; x: number[]; y: number[]; xAxis: PlotAxis; yLabel: string; yUnit: string }
  | { kind: "spectrum"; id: string; title: string; frequency: number[]; magnitude: number[]; xAxis: PlotAxis; yLabel: string; yUnit: string }
  | { kind: "histogram"; id: string; title: string; binEdges: number[]; counts: number[]; density: number[]; xAxis: PlotAxis; yLabel: string; yUnit: string }
  | { kind: "metrics"; id: string; title: string; metrics: Array<{ label: string; value: number; unit: string }> }
  | { kind: "heatmap"; id: string; title: string; method: "STFT" | "CWT"; time: number[]; frequency: number[]; power: number[][]; unit: string }
  | { kind: "status"; id: string; title: string; status: "pending" | "running" | "error"; message: string };

export const defaultSignalDomain = (): SignalDomain => ({
  kind: "time",
  label: "Time",
  unit: "s",
  linkToMaster: true
});

export const createSignalPlotModel = (signal: Signal): ScientificPlotModel => {
  const domain = signal.domain ?? defaultSignalDomain();
  return {
    kind: "line",
    id: signal.id,
    title: signal.name,
    x: signal.time,
    y: signal.values,
    xAxis: domain,
    yLabel: "Value",
    yUnit: signal.unit
  };
};

export const createAnalysisPlotModel = (analysis: AnalysisResult): ScientificPlotModel => {
  switch (analysis.type) {
    case "scalar":
      return { kind: "metrics", id: analysis.id, title: analysis.name, metrics: [{ label: analysis.label, value: analysis.value, unit: analysis.unit }] };
    case "summary":
      return { kind: "metrics", id: analysis.id, title: analysis.name, metrics: analysis.metrics };
    case "distribution":
      return {
        kind: "histogram",
        id: analysis.id,
        title: analysis.name,
        binEdges: analysis.binEdges,
        counts: analysis.counts,
        density: analysis.density,
        xAxis: { kind: "value", label: "Value", unit: analysis.unit, linkToMaster: false },
        yLabel: "Count",
        yUnit: "samples"
      };
    case "spectrum":
      return {
        kind: "spectrum",
        id: analysis.id,
        title: analysis.name,
        frequency: analysis.frequency,
        magnitude: analysis.magnitude,
        xAxis: { kind: "frequency", label: "Frequency", unit: "Hz", linkToMaster: false },
        yLabel: "Magnitude",
        yUnit: analysis.unit
      };
    case "time-frequency":
      return {
        kind: "heatmap",
        id: analysis.id,
        title: analysis.name,
        method: analysis.method,
        time: analysis.time,
        frequency: analysis.frequency,
        power: analysis.power,
        unit: analysis.unit
      };
    case "time-frequency-pending":
      return { kind: "status", id: analysis.id, title: analysis.name, status: analysis.status, message: analysis.message };
    case "time-frequency-error":
      return { kind: "status", id: analysis.id, title: analysis.name, status: "error", message: analysis.message };
  }
};

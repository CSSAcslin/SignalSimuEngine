import type { AnalysisResult } from "./types";

export type AnalysisSummary = {
  kind: "scalar" | "spectrum" | "time-frequency";
  headline: string;
  primaryLabel: string;
  primaryValue?: number;
  primaryText?: string;
  unit?: string;
  rows: Array<{ label: string; value: string }>;
};

const textNumber = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(4);
  return String(Number(value.toPrecision(6)));
};

export const summarizeAnalysisResult = (analysis: AnalysisResult): AnalysisSummary => {
  if (analysis.type === "scalar") {
    return {
      kind: "scalar",
      headline: analysis.label,
      primaryLabel: analysis.label,
      primaryValue: analysis.value,
      unit: analysis.unit,
      rows: [
        { label: "Value", value: textNumber(analysis.value) },
        { label: "Unit", value: analysis.unit }
      ]
    };
  }

  if (analysis.type === "spectrum") {
    const peakIndex = analysis.magnitude.reduce((best, value, index) => (value > analysis.magnitude[best] ? index : best), 0);
    const peakFrequency = analysis.frequency[peakIndex] ?? 0;
    const peakMagnitude = analysis.magnitude[peakIndex] ?? 0;
    const firstFrequency = analysis.frequency[0] ?? 0;
    const lastFrequency = analysis.frequency[analysis.frequency.length - 1] ?? firstFrequency;
    return {
      kind: "spectrum",
      headline: analysis.name,
      primaryLabel: "Peak Frequency",
      primaryValue: peakFrequency,
      unit: "Hz",
      rows: [
        { label: "Peak Magnitude", value: textNumber(peakMagnitude) },
        { label: "Bins", value: String(analysis.frequency.length) },
        { label: "Range", value: `${textNumber(firstFrequency)} - ${textNumber(lastFrequency)} Hz` }
      ]
    };
  }

  return {
    kind: "time-frequency",
    headline: analysis.method,
    primaryLabel: "Backend Status",
    primaryText: analysis.status,
    rows: [
      { label: "Status", value: analysis.status },
      { label: "Expected Output", value: "time-frequency matrix" },
      { label: "Message", value: analysis.message }
    ]
  };
};

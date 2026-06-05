export type SourceKind =
  | "sine"
  | "triangle"
  | "square"
  | "pulse"
  | "gaussianPulse"
  | "chirp"
  | "noise"
  | "constant"
  | "import"
  | "customSource";

export type OperationKind =
  | "add"
  | "subtract"
  | "multiply"
  | "scale"
  | "delay"
  | "convolve"
  | "correlate"
  | "fft"
  | "normalize"
  | "rms"
  | "mean"
  | "peak"
  | "quantiles"
  | "distribution"
  | "customExpression"
  | "externalCommand"
  | "snr"
  | "dominantFrequency"
  | "bandwidth"
  | "stft"
  | "cwt";

export type NodeKind = SourceKind | OperationKind;

export type ParamValue = number | string | boolean | number[];

export type ParamSchema = {
  key: string;
  label: string;
  type: "number" | "text" | "array" | "select";
  defaultValue: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Array<{ label: string; value: string }>;
};

export type Signal = {
  id: string;
  name: string;
  sampleRate: number;
  unit: string;
  time: number[];
  values: number[];
  params: Record<string, ParamValue>;
  seed?: number;
  timelineOffset?: number;
  provenance?: ResultProvenance;
};

export type ResultProvenance = {
  nodeId: string;
  nodeName: string;
  nodeKind: NodeKind;
  inputNodeIds: string[];
  params: Record<string, ParamValue>;
  sampleRate?: number;
  sampleCount?: number;
  unit?: string;
  backend?: string;
  warnings?: string[];
  metadata?: Record<string, unknown>;
};

export type Spectrum = {
  frequency: number[];
  magnitude: number[];
};

export type ScalarAnalysisResult = {
  type: "scalar";
  id: string;
  name: string;
  label: string;
  value: number;
  unit: string;
  params: Record<string, ParamValue>;
  provenance?: ResultProvenance;
};

export type SpectrumAnalysisResult = {
  type: "spectrum";
  id: string;
  name: string;
  frequency: number[];
  magnitude: number[];
  unit: string;
  params: Record<string, ParamValue>;
  provenance?: ResultProvenance;
};

export type SummaryAnalysisResult = {
  type: "summary";
  id: string;
  name: string;
  metrics: Array<{ label: string; value: number; unit: string }>;
  params: Record<string, ParamValue>;
  provenance?: ResultProvenance;
};

export type DistributionAnalysisResult = {
  type: "distribution";
  id: string;
  name: string;
  binEdges: number[];
  counts: number[];
  density: number[];
  unit: string;
  params: Record<string, ParamValue>;
  provenance?: ResultProvenance;
};

export type TimeFrequencyPendingResult = {
  type: "time-frequency-pending";
  id: string;
  name: string;
  method: "STFT" | "CWT";
  status: "pending" | "running";
  message: string;
  params: Record<string, ParamValue>;
  provenance?: ResultProvenance;
};

export type TimeFrequencyAnalysisResult = {
  type: "time-frequency";
  id: string;
  name: string;
  method: "STFT" | "CWT";
  status: "done";
  time: number[];
  frequency: number[];
  power: number[][];
  unit: string;
  params: Record<string, ParamValue>;
  provenance?: ResultProvenance;
};

export type TimeFrequencyErrorResult = {
  type: "time-frequency-error";
  id: string;
  name: string;
  method: "STFT" | "CWT";
  status: "error";
  message: string;
  params: Record<string, ParamValue>;
  provenance?: ResultProvenance;
};

export type AnalysisResult = ScalarAnalysisResult | SpectrumAnalysisResult | SummaryAnalysisResult | DistributionAnalysisResult | TimeFrequencyPendingResult | TimeFrequencyAnalysisResult | TimeFrequencyErrorResult;

export type XYPosition = {
  x: number;
  y: number;
};

export type BaseGraphNode = {
  id: string;
  name: string;
  position: XYPosition;
  timelineOffset: number;
  params: Record<string, ParamValue>;
};

export type SignalSourceNode = BaseGraphNode & {
  type: "source";
  kind: SourceKind;
  sampleRate: number;
  length: number;
  seed?: number;
};

export type OperationNode = BaseGraphNode & {
  type: "operation";
  kind: OperationKind;
};

export type SignalNode = SignalSourceNode | OperationNode;

export type SignalEdge = {
  id: string;
  from: string;
  to: string;
};

export type SignalGraph = {
  schemaVersion?: number;
  sampleRate?: number;
  samples?: number;
  disabledNodeIds?: string[];
  nodes: SignalNode[];
  edges: SignalEdge[];
  selectedNodeId?: string;
  displayNodeId?: string;
};

export type GraphEvaluation = {
  signals: Map<string, Signal>;
  spectra: Map<string, Spectrum>;
  analysis: Map<string, AnalysisResult>;
  errors: Map<string, string>;
  order: string[];
};

export type ModuleDefinition = {
  kind: NodeKind;
  type: "source" | "operation" | "analysis";
  outputType?: "signal" | "scalar" | "summary" | "spectrum" | "distribution" | "time-frequency";
  label: string;
  description: string;
  inputCount: number | "many";
  params: ParamSchema[];
};

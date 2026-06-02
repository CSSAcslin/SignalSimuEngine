export type SourceKind =
  | "sine"
  | "triangle"
  | "square"
  | "pulse"
  | "gaussianPulse"
  | "chirp"
  | "noise"
  | "constant"
  | "import";

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
};

export type SpectrumAnalysisResult = {
  type: "spectrum";
  id: string;
  name: string;
  frequency: number[];
  magnitude: number[];
  unit: string;
  params: Record<string, ParamValue>;
};

export type TimeFrequencyPendingResult = {
  type: "time-frequency-pending";
  id: string;
  name: string;
  method: "STFT" | "CWT";
  status: "pending";
  message: string;
  params: Record<string, ParamValue>;
};

export type AnalysisResult = ScalarAnalysisResult | SpectrumAnalysisResult | TimeFrequencyPendingResult;

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
  outputType?: "signal" | "scalar" | "spectrum" | "time-frequency";
  label: string;
  description: string;
  inputCount: number | "many";
  params: ParamSchema[];
};

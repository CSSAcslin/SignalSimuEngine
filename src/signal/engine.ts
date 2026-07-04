import type {
  AnalysisResult,
  GraphEvaluation,
  OperationKind,
  OperationNode,
  Signal,
  SignalGraph,
  SignalNode,
  SignalSourceNode,
  Spectrum
} from "./types";

const asNumber = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const makeTime = (length: number, sampleRate: number) => Array.from({ length }, (_, index) => index / sampleRate);

const expressionSymbols = {
  pi: Math.PI,
  e: Math.E,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  exp: Math.exp,
  log: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round
};

const expressionVariableNames = ["t", "n", "x", "sampleRate", "p0", "p1", "p2"] as const;
const expressionSymbolNames = Object.keys(expressionSymbols);
const allowedExpressionNames = new Set([...expressionVariableNames, ...expressionSymbolNames]);
const expressionNamePattern = /[A-Za-z_][A-Za-z0-9_]*/g;
const expressionCharacterPattern = /^[0-9A-Za-z_+\-*/%^().,\s]+$/;

type ExpressionVariables = Record<string, number | undefined>;
type ExpressionFunction = (...args: Array<number | ((...args: number[]) => number)>) => unknown;
type CompiledExpression = { fn: ExpressionFunction; error?: never } | { fn?: never; error: string };

const expressionText = (params: Record<string, unknown>, fallback: string) => (typeof params.expression === "string" ? params.expression : fallback);
const isInputExpressionName = (name: string) => /^x\d+$/.test(name);

const compileExpression = (expression: string, extraVariableNames: string[] = []): CompiledExpression => {
  const normalizedExpression = expression.trim().replaceAll("^", "**");
  if (normalizedExpression.length === 0) return { error: "Expression cannot be empty." };
  if (!expressionCharacterPattern.test(normalizedExpression)) return { error: "Expression contains unsupported characters." };

  const allowedNames = new Set([...allowedExpressionNames, ...extraVariableNames]);
  const identifiers = normalizedExpression.match(expressionNamePattern) ?? [];
  const unknownIdentifier = identifiers.find((identifier) => !allowedNames.has(identifier) && !isInputExpressionName(identifier));
  if (unknownIdentifier) return { error: `Unknown expression symbol: ${unknownIdentifier}` };

  try {
    const argumentNames = [...expressionVariableNames, ...extraVariableNames, ...expressionSymbolNames];
    const fn = new Function(...argumentNames, `"use strict"; return (${normalizedExpression});`) as ExpressionFunction;
    return { fn };
  } catch {
    return { error: "Expression syntax is invalid." };
  }
};

const evaluateExpressionValue = (
  compiled: CompiledExpression,
  variables: ExpressionVariables,
  extraVariableNames: string[] = []
): { value: number; warning?: string } => {
  if (!compiled.fn) return { value: 0, warning: compiled.error };
  try {
    const variableValues = expressionVariableNames.map((name) => variables[name] ?? 0);
    const extraVariableValues = extraVariableNames.map((name) => variables[name] ?? 0);
    const symbolValues = expressionSymbolNames.map((name) => expressionSymbols[name as keyof typeof expressionSymbols]);
    const result = compiled.fn(...variableValues, ...extraVariableValues, ...symbolValues);
    const value = Number(result);
    if (!Number.isFinite(value)) return { value: 0, warning: "Expression produced a non-finite value." };
    return { value };
  } catch {
    return { value: 0, warning: "Expression evaluation failed." };
  }
};

const nodeProvenance = (node: SignalNode, inputNodeIds: string[], sampleRate?: number, sampleCount?: number, unit?: string, metadata?: Record<string, unknown>) => ({
  nodeId: node.id,
  nodeName: node.name,
  nodeKind: node.kind,
  inputNodeIds,
  params: { ...node.params },
  sampleRate,
  sampleCount,
  unit,
  metadata
});

const seededRandom = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const baseSignal = (node: SignalSourceNode, values: number[]): Signal => ({
  id: node.id,
  name: node.name,
  sampleRate: node.sampleRate,
  unit: "a.u.",
  time: makeTime(values.length, node.sampleRate),
  values,
  params: { ...node.params },
  seed: node.seed,
  timelineOffset: node.timelineOffset,
  provenance: nodeProvenance(node, [], node.sampleRate, values.length, "a.u.")
});

export const createSourceSignal = (node: Omit<SignalSourceNode, "type" | "position" | "timelineOffset"> & Partial<SignalSourceNode>): Signal => {
  const length = Math.max(1, Math.floor(node.length));
  const sampleRate = Math.max(1, node.sampleRate);
  const params = node.params ?? {};
  const amplitude = asNumber(params.amplitude, 1);
  const frequency = asNumber(params.frequency, 1);
  const phase = asNumber(params.phase, 0);
  const timelineOffset = node.timelineOffset ?? 0;
  const sourceNode: SignalSourceNode = {
    type: "source",
    position: node.position ?? { x: 0, y: 0 },
    timelineOffset,
    ...node,
    length,
    sampleRate,
    params
  };

  if (node.kind === "import") {
    const imported = Array.isArray(params.values) ? params.values.map((value) => Number(value) || 0) : [];
    return baseSignal(sourceNode, imported.length > 0 ? imported : [0]);
  }

  if (node.kind === "noise") {
    const random = seededRandom(node.seed ?? 1);
    return baseSignal(
      sourceNode,
      Array.from({ length }, () => (random() * 2 - 1) * amplitude)
    );
  }

  if (node.kind === "customSource") {
    const expression = expressionText(params, "p0 * sin(2*pi*p1*t + p2)");
    const compiled = compileExpression(expression);
    const p0 = asNumber(params.p0, 1);
    const p1 = asNumber(params.p1, 5);
    const p2 = asNumber(params.p2, 0);
    const warnings = new Set<string>();
    const values = makeTime(length, sampleRate).map((time, index) => {
      const result = evaluateExpressionValue(compiled, { t: time, n: index, sampleRate, p0, p1, p2 });
      if (result.warning) warnings.add(result.warning);
      return result.value;
    });
    const signal = baseSignal(sourceNode, values);
    return {
      ...signal,
      provenance: signal.provenance ? { ...signal.provenance, warnings: [...warnings] } : signal.provenance
    };
  }

  const values = makeTime(length, sampleRate).map((time) => {
    switch (node.kind) {
      case "sine":
        return amplitude * Math.sin(2 * Math.PI * frequency * time + phase);
      case "triangle":
        return amplitude * (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * frequency * time + phase));
      case "square":
        return Math.sin(2 * Math.PI * frequency * time + phase) >= 0 ? amplitude : -amplitude;
      case "pulse": {
        const start = asNumber(params.start, 0.1);
        const width = asNumber(params.width, 0.1);
        return time >= start && time <= start + width ? amplitude : 0;
      }
      case "gaussianPulse": {
        const center = asNumber(params.center, 0.2);
        const sigma = Math.max(asNumber(params.sigma, 0.04), 1e-9);
        const z = (time - center) / sigma;
        return amplitude * Math.exp(-0.5 * z * z);
      }
      case "chirp": {
        const startFrequency = asNumber(params.startFrequency, 1);
        const endFrequency = asNumber(params.endFrequency, 20);
        const duration = length / sampleRate;
        const sweep = (endFrequency - startFrequency) / Math.max(duration, 1 / sampleRate);
        return amplitude * Math.sin(2 * Math.PI * (startFrequency * time + 0.5 * sweep * time * time));
      }
      case "constant":
        return asNumber(params.value, 1);
      default:
        return 0;
    }
  });

  return baseSignal(sourceNode, values);
};

const cloneWithValues = (source: Signal, id: string, name: string, values: number[]): Signal => ({
  id,
  name,
  sampleRate: source.sampleRate,
  unit: source.unit,
  time: makeTime(values.length, source.sampleRate),
  values,
  params: {},
  timelineOffset: source.timelineOffset,
  provenance: source.provenance
});

const placeOnGlobalGrid = (signal: Signal, sampleRate: number, samples: number): Signal => {
  const values = Array(Math.max(1, samples)).fill(0) as number[];
  const offsetSamples = Math.max(0, Math.round((signal.timelineOffset ?? 0) * sampleRate));
  signal.values.forEach((value, index) => {
    const targetIndex = offsetSamples + index;
    if (targetIndex < values.length) values[targetIndex] = value;
  });

  return {
    ...signal,
    sampleRate,
    time: makeTime(values.length, sampleRate),
    values,
    provenance: signal.provenance
      ? { ...signal.provenance, sampleRate, sampleCount: values.length }
      : signal.provenance
  };
};

const sameLengthValues = (signals: Signal[], reducer: (values: number[]) => number) => {
  const length = Math.min(...signals.map((signal) => signal.values.length));
  return Array.from({ length }, (_, index) => reducer(signals.map((signal) => signal.values[index] ?? 0)));
};

export const normalizeSignal = (signal: Signal): Signal => {
  const peak = Math.max(...signal.values.map((value) => Math.abs(value)), 0);
  if (peak === 0) return cloneWithValues(signal, signal.id, signal.name, [...signal.values]);
  return cloneWithValues(signal, signal.id, signal.name, signal.values.map((value) => value / peak));
};

export const convolve = (a: number[], b: number[]) => {
  const output = Array(a.length + b.length - 1).fill(0) as number[];
  a.forEach((left, leftIndex) => {
    b.forEach((right, rightIndex) => {
      output[leftIndex + rightIndex] += left * right;
    });
  });
  return output;
};

export const correlate = (a: number[], b: number[]) => convolve(a, [...b].reverse());

export const fftSpectrum = (signal: Signal): Spectrum => {
  const n = signal.values.length;
  const bins = Math.floor(n / 2);
  const frequency: number[] = [];
  const magnitude: number[] = [];

  for (let k = 0; k < bins; k += 1) {
    let real = 0;
    let imag = 0;
    for (let index = 0; index < n; index += 1) {
      const angle = (-2 * Math.PI * k * index) / n;
      real += signal.values[index] * Math.cos(angle);
      imag += signal.values[index] * Math.sin(angle);
    }
    frequency.push((k * signal.sampleRate) / n);
    magnitude.push(Math.sqrt(real * real + imag * imag) / n);
  }

  return { frequency, magnitude };
};

const meanValue = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

const percentileValue = (values: number[], percentile: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const p = Math.min(100, Math.max(0, percentile));
  const position = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? sorted[lower] ?? 0) * weight;
};

const scalarAnalysis = (node: OperationNode, inputs: Signal[], label: string, value: number, unit: string): AnalysisResult => ({
  type: "scalar",
  id: node.id,
  name: node.name,
  label,
  value,
  unit,
  params: { ...node.params },
  provenance: nodeProvenance(node, inputs.map((signal) => signal.provenance?.nodeId ?? signal.id), inputs[0]?.sampleRate, inputs[0]?.values.length, unit)
});

const spectralAnalysis = (node: OperationNode, signal: Signal): { spectrum: Spectrum; analysis: AnalysisResult } => {
  const spectrum = fftSpectrum(signal);
  return {
    spectrum,
    analysis: {
      type: "spectrum",
      id: node.id,
      name: node.name,
      frequency: spectrum.frequency,
      magnitude: spectrum.magnitude,
      unit: signal.unit,
      params: { ...node.params },
      provenance: nodeProvenance(node, [signal.provenance?.nodeId ?? signal.id], signal.sampleRate, signal.values.length, signal.unit)
    }
  };
};

const quantileAnalysis = (node: OperationNode, inputs: Signal[]): AnalysisResult => {
  const signal = inputs[0];
  const values = signal.values;
  const percentile = Math.min(100, Math.max(0, asNumber(node.params.percentile, 50)));
  return {
    type: "summary",
    id: node.id,
    name: node.name,
    metrics: [
      { label: "Mean", value: meanValue(values), unit: signal.unit },
      { label: "Min", value: Math.min(...values), unit: signal.unit },
      { label: "Max", value: Math.max(...values), unit: signal.unit },
      { label: `P${Number(percentile.toPrecision(4))}`, value: percentileValue(values, percentile), unit: signal.unit }
    ],
    params: { ...node.params, percentile },
    provenance: nodeProvenance(node, inputs.map((item) => item.provenance?.nodeId ?? item.id), signal.sampleRate, signal.values.length, signal.unit)
  };
};

const distributionAnalysis = (node: OperationNode, inputs: Signal[]): AnalysisResult => {
  const signal = inputs[0];
  const values = signal.values;
  const bins = Math.min(200, Math.max(1, Math.floor(asNumber(node.params.bins, 24))));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = span / bins;
  const counts = Array(bins).fill(0) as number[];
  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)));
    counts[index] += 1;
  });
  const binEdges = Array.from({ length: bins + 1 }, (_, index) => min + width * index);
  return {
    type: "distribution",
    id: node.id,
    name: node.name,
    binEdges,
    counts,
    density: counts.map((count) => count / Math.max(values.length, 1)),
    unit: signal.unit,
    params: { ...node.params, bins },
    provenance: nodeProvenance(node, inputs.map((item) => item.provenance?.nodeId ?? item.id), signal.sampleRate, signal.values.length, signal.unit)
  };
};

const dominantFrequency = (signal: Signal) => {
  const spectrum = fftSpectrum(signal);
  if (spectrum.magnitude.length <= 1) return 0;
  let best = 1;
  for (let index = 2; index < spectrum.magnitude.length; index += 1) {
    if (spectrum.magnitude[index] > spectrum.magnitude[best]) best = index;
  }
  return spectrum.frequency[best] ?? 0;
};

const occupiedBandwidth = (signal: Signal, threshold: number) => {
  const spectrum = fftSpectrum(signal);
  const peak = Math.max(...spectrum.magnitude, 0);
  if (peak <= 0) return 0;
  const cutoff = peak * Math.min(1, Math.max(0, threshold));
  const bins = spectrum.frequency.filter((_, index) => spectrum.magnitude[index] >= cutoff);
  if (bins.length <= 1) return 0;
  return bins[bins.length - 1] - bins[0];
};

const secondOrderCorrelation = (node: OperationNode, inputs: Signal[]): { signal?: Signal; analysis?: AnalysisResult; error?: string } => {
  const correlationType = typeof node.params.correlationType === "string" ? node.params.correlationType : "auto";
  const outputMode = typeof node.params.outputMode === "string" ? node.params.outputMode : "averageAtLag";
  const normalization = typeof node.params.normalization === "string" ? node.params.normalization : "normalized";
  const lagSamples = Math.max(0, Math.floor(asNumber(node.params.lagSamples, 0)));
  const requestedAveragePoints = Math.max(0, Math.floor(asNumber(node.params.averagePoints, 0)));
  const left = inputs[0];
  const right = correlationType === "cross" ? inputs[1] : inputs[0];
  if (!left) return { error: "G2 correlation requires at least one input." };
  if (correlationType === "cross" && !right) return { error: "G2 cross-correlation requires two inputs." };
  if (!right) return { error: "G2 correlation has no comparison input." };

  const overlapLength = Math.min(left.values.length, right.values.length - lagSamples);
  const length = requestedAveragePoints > 0 ? Math.min(overlapLength, requestedAveragePoints) : overlapLength;
  if (length <= 0) return { error: "Lag is outside the overlapping signal range." };

  const normalized = normalization !== "raw";
  const leftMean = meanValue(left.values);
  const rightMean = meanValue(right.values);
  const denominator = normalized ? leftMean * rightMean : 1;
  if (normalized && Math.abs(denominator) < 1e-12) return { error: "G2 normalization requires non-zero input means." };

  const values = Array.from({ length }, (_, index) => (left.values[index] * right.values[index + lagSamples]) / denominator);
  const lagSeconds = lagSamples / Math.max(left.sampleRate, 1e-12);
  const params = { ...node.params, correlationType, outputMode, normalization: normalized ? "normalized" : "raw", lagSamples, lagSeconds, averagePoints: requestedAveragePoints, usedPoints: length };
  const inputNodeIds = inputs.slice(0, correlationType === "cross" ? 2 : 1).map((signal) => signal.provenance?.nodeId ?? signal.id);
  const unit = normalized ? "g2" : correlationType === "cross" ? `${left.unit} * ${right.unit}` : `${left.unit}^2`;
  const labelPrefix = normalized ? "g2" : "G2";

  if (outputMode === "curveOverTime") {
    return {
      signal: {
        id: node.id,
        name: node.name,
        sampleRate: left.sampleRate,
        unit,
        time: left.time.slice(0, length),
        values,
        params,
        provenance: nodeProvenance(node, inputNodeIds, left.sampleRate, length, unit, {
          correlationType,
          outputMode,
          normalization: normalized ? "normalized" : "raw",
          lagSamples,
          lagSeconds,
          averagePoints: requestedAveragePoints,
          usedPoints: length
        })
      }
    };
  }

  return {
    analysis: {
      type: "scalar",
      id: node.id,
      name: node.name,
      label: correlationType === "cross" ? `${labelPrefix} Cross-correlation` : `${labelPrefix} Autocorrelation`,
      value: meanValue(values),
      unit,
      params,
      provenance: nodeProvenance(node, inputNodeIds, left.sampleRate, length, unit, {
        correlationType,
        outputMode,
        normalization: normalized ? "normalized" : "raw",
        lagSamples,
        lagSeconds
      })
    }
  };
};

const applyOperation = (node: OperationNode, inputs: Signal[]): { signal?: Signal; spectrum?: Spectrum; analysis?: AnalysisResult; error?: string } => {
  const name = node.name;
  const kind = node.kind as OperationKind;
  const inputNodeIds = inputs.map((signal) => signal.provenance?.nodeId ?? signal.id);
  const withOperationProvenance = (signal: Signal) => ({
    ...signal,
    provenance: nodeProvenance(node, inputNodeIds, signal.sampleRate, signal.values.length, signal.unit)
  });

  if (inputs.length === 0) return { error: "Operation has no input signals." };

  switch (kind) {
    case "add":
      return { signal: withOperationProvenance(cloneWithValues(inputs[0], node.id, name, sameLengthValues(inputs, (values) => values.reduce((sum, value) => sum + value, 0)))) };
    case "subtract":
      if (inputs.length < 2) return { error: "Subtract requires two inputs." };
      return { signal: withOperationProvenance(cloneWithValues(inputs[0], node.id, name, sameLengthValues(inputs.slice(0, 2), ([a, b]) => a - b))) };
    case "multiply":
      return { signal: withOperationProvenance(cloneWithValues(inputs[0], node.id, name, sameLengthValues(inputs, (values) => values.reduce((product, value) => product * value, 1)))) };
    case "scale": {
      const gain = asNumber(node.params.gain, 1);
      return { signal: withOperationProvenance(cloneWithValues(inputs[0], node.id, name, inputs[0].values.map((value) => value * gain))) };
    }
    case "customExpression": {
      const inputNames = inputs.map((_, index) => `x${index}`);
      const expression = expressionText(node.params, "x0 + p0 * x1");
      const compiled = compileExpression(expression, inputNames);
      const p0 = asNumber(node.params.p0, 1);
      const p1 = asNumber(node.params.p1, 0);
      const p2 = asNumber(node.params.p2, 0);
      if (!compiled.fn) return { error: compiled.error };
      const warnings = new Set<string>();
      const length = Math.min(...inputs.map((input) => input.values.length));
      const values = Array.from({ length }, (_, index) => {
        const expressionInputs = Object.fromEntries(inputs.map((input, inputIndex) => [`x${inputIndex}`, input.values[index] ?? 0]));
        const result = evaluateExpressionValue(
          compiled,
          { ...expressionInputs, t: inputs[0].time[index] ?? index / inputs[0].sampleRate, n: index, sampleRate: inputs[0].sampleRate, p0, p1, p2 },
          inputNames
        );
        if (result.warning) warnings.add(result.warning);
        return result.value;
      });
      const signal = withOperationProvenance(cloneWithValues(inputs[0], node.id, name, values));
      return {
        signal: {
          ...signal,
          provenance: signal.provenance ? { ...signal.provenance, warnings: [...warnings] } : signal.provenance
        }
      };
    }
    case "externalCommand":
      return { error: "External command execution requires the desktop shell or local backend protocol." };
    case "delay": {
      const samples = Math.max(0, Math.floor(asNumber(node.params.samples, 0)));
      return { signal: withOperationProvenance(cloneWithValues(inputs[0], node.id, name, [...Array(samples).fill(0), ...inputs[0].values])) };
    }
    case "convolve":
      if (inputs.length < 2) return { error: "Convolution requires two inputs." };
      return { signal: withOperationProvenance(cloneWithValues(inputs[0], node.id, name, convolve(inputs[0].values, inputs[1].values))) };
    case "correlate":
      if (inputs.length < 2) return { error: "Cross-correlation requires two inputs." };
      return { signal: withOperationProvenance(cloneWithValues(inputs[0], node.id, name, correlate(inputs[0].values, inputs[1].values))) };
    case "fft":
      return spectralAnalysis(node, inputs[0]);
    case "normalize": {
      const normalized = normalizeSignal(inputs[0]);
      return { signal: withOperationProvenance({ ...normalized, id: node.id, name }) };
    }
    case "rms":
      return { analysis: scalarAnalysis(node, inputs, "RMS", Math.sqrt(meanValue(inputs[0].values.map((value) => value * value))), inputs[0].unit) };
    case "mean":
      return { analysis: scalarAnalysis(node, inputs, "Mean", meanValue(inputs[0].values), inputs[0].unit) };
    case "peak":
      return { analysis: scalarAnalysis(node, inputs, "Peak", Math.max(...inputs[0].values.map((value) => Math.abs(value)), 0), inputs[0].unit) };
    case "quantiles":
      return { analysis: quantileAnalysis(node, inputs) };
    case "distribution":
      return { analysis: distributionAnalysis(node, inputs) };
    case "snr": {
      const signalPower = meanValue(inputs[0].values.map((value) => value * value));
      const noiseFloor = Math.max(asNumber(node.params.noiseFloor, 0.1), 1e-12);
      return { analysis: scalarAnalysis(node, inputs, "SNR", 10 * Math.log10(Math.max(signalPower, 1e-24) / (noiseFloor * noiseFloor)), "dB") };
    }
    case "dominantFrequency":
      return { analysis: scalarAnalysis(node, inputs, "Dominant Frequency", dominantFrequency(inputs[0]), "Hz") };
    case "bandwidth":
      return { analysis: scalarAnalysis(node, inputs, "Bandwidth", occupiedBandwidth(inputs[0], asNumber(node.params.threshold, 0.5)), "Hz") };
    case "secondOrderCorrelation":
      return secondOrderCorrelation(node, inputs);
    case "stft":
      return {
        analysis: {
          type: "time-frequency-pending",
          id: node.id,
          name,
          method: "STFT",
          status: "pending",
          message: "Python/SciPy backend required.",
          params: { ...node.params },
          provenance: { ...nodeProvenance(node, inputNodeIds, inputs[0].sampleRate, inputs[0].values.length, inputs[0].unit), backend: "local-python-scipy" }
        }
      };
    case "cwt":
      return {
        analysis: {
          type: "time-frequency-pending",
          id: node.id,
          name,
          method: "CWT",
          status: "pending",
          message: "Python/SciPy backend required.",
          params: { ...node.params },
          provenance: { ...nodeProvenance(node, inputNodeIds, inputs[0].sampleRate, inputs[0].values.length, inputs[0].unit), backend: "local-python-scipy" }
        }
      };
    default:
      return { error: `Unsupported operation: ${kind}` };
  }
};

const topologicalSort = (graph: SignalGraph) => {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();

  graph.nodes.forEach((node) => {
    incoming.set(node.id, new Set());
    outgoing.set(node.id, new Set());
  });

  graph.edges.forEach((edge) => {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) return;
    incoming.get(edge.to)?.add(edge.from);
    outgoing.get(edge.from)?.add(edge.to);
  });

  const ready = graph.nodes.filter((node) => (incoming.get(node.id)?.size ?? 0) === 0).map((node) => node.id);
  const order: string[] = [];

  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    outgoing.get(id)?.forEach((target) => {
      incoming.get(target)?.delete(id);
      if ((incoming.get(target)?.size ?? 0) === 0) ready.push(target);
    });
  }

  return order.length === graph.nodes.length ? order : null;
};

export const evaluateGraph = (graph: SignalGraph): GraphEvaluation => {
  const signals = new Map<string, Signal>();
  const spectra = new Map<string, Spectrum>();
  const analysis = new Map<string, AnalysisResult>();
  const errors = new Map<string, string>();
  const order = topologicalSort(graph);

  if (!order) {
    graph.nodes.forEach((node) => errors.set(node.id, "Cycle detected. The MVP graph must be acyclic."));
    return { signals, spectra, analysis, errors, order: [] };
  }

  const nodesById = new Map<string, SignalNode>(graph.nodes.map((node) => [node.id, node]));
  const disabledNodeIds = new Set(graph.disabledNodeIds ?? []);
  const globalSampleRate = graph.sampleRate && graph.sampleRate > 0 ? graph.sampleRate : undefined;
  const globalSamples = graph.samples && graph.samples > 0 ? graph.samples : undefined;

  order.forEach((id) => {
    const node = nodesById.get(id);
    if (!node) return;
    if (disabledNodeIds.has(id)) {
      errors.set(id, "Node is disabled.");
      return;
    }

    if (node.type === "source") {
      const signal = createSourceSignal(globalSampleRate ? { ...node, sampleRate: globalSampleRate } : node);
      signals.set(id, globalSampleRate && globalSamples ? placeOnGlobalGrid(signal, globalSampleRate, globalSamples) : signal);
      return;
    }

    const incomingEdges = graph.edges.filter((edge) => edge.to === id);
    const analysisInput = incomingEdges.find((edge) => analysis.has(edge.from) && !signals.has(edge.from));
    if (analysisInput) {
      const inputNode = nodesById.get(analysisInput.from);
      errors.set(id, `Input ${inputNode?.name ?? analysisInput.from} is an analysis result and cannot feed signal operations.`);
      return;
    }
    const missingInput = incomingEdges.find((edge) => !signals.has(edge.from));
    if (missingInput) {
      const inputNode = nodesById.get(missingInput.from);
      errors.set(id, `Input ${inputNode?.name ?? missingInput.from} is disabled or unavailable.`);
      return;
    }
    const inputs = incomingEdges
      .map((edge) => signals.get(edge.from))
      .filter((signal): signal is Signal => Boolean(signal));
    const result = applyOperation(node, inputs);

    if (result.error) errors.set(id, result.error);
    if (result.signal) signals.set(id, result.signal);
    if (result.spectrum) spectra.set(id, result.spectrum);
    if (result.analysis) analysis.set(id, result.analysis);
  });

  return { signals, spectra, analysis, errors, order };
};

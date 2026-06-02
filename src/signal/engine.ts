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
  timelineOffset: node.timelineOffset
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
  timelineOffset: source.timelineOffset
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
    values
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

const scalarAnalysis = (node: OperationNode, label: string, value: number, unit: string): AnalysisResult => ({
  type: "scalar",
  id: node.id,
  name: node.name,
  label,
  value,
  unit,
  params: { ...node.params }
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
      params: { ...node.params }
    }
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

const applyOperation = (node: OperationNode, inputs: Signal[]): { signal?: Signal; spectrum?: Spectrum; analysis?: AnalysisResult; error?: string } => {
  const name = node.name;
  const kind = node.kind as OperationKind;

  if (inputs.length === 0) return { error: "Operation has no input signals." };

  switch (kind) {
    case "add":
      return { signal: cloneWithValues(inputs[0], node.id, name, sameLengthValues(inputs, (values) => values.reduce((sum, value) => sum + value, 0))) };
    case "subtract":
      if (inputs.length < 2) return { error: "Subtract requires two inputs." };
      return { signal: cloneWithValues(inputs[0], node.id, name, sameLengthValues(inputs.slice(0, 2), ([a, b]) => a - b)) };
    case "multiply":
      return { signal: cloneWithValues(inputs[0], node.id, name, sameLengthValues(inputs, (values) => values.reduce((product, value) => product * value, 1))) };
    case "scale": {
      const gain = asNumber(node.params.gain, 1);
      return { signal: cloneWithValues(inputs[0], node.id, name, inputs[0].values.map((value) => value * gain)) };
    }
    case "delay": {
      const samples = Math.max(0, Math.floor(asNumber(node.params.samples, 0)));
      return { signal: cloneWithValues(inputs[0], node.id, name, [...Array(samples).fill(0), ...inputs[0].values]) };
    }
    case "convolve":
      if (inputs.length < 2) return { error: "Convolution requires two inputs." };
      return { signal: cloneWithValues(inputs[0], node.id, name, convolve(inputs[0].values, inputs[1].values)) };
    case "correlate":
      if (inputs.length < 2) return { error: "Cross-correlation requires two inputs." };
      return { signal: cloneWithValues(inputs[0], node.id, name, correlate(inputs[0].values, inputs[1].values)) };
    case "fft":
      return spectralAnalysis(node, inputs[0]);
    case "normalize": {
      const normalized = normalizeSignal(inputs[0]);
      return { signal: { ...normalized, id: node.id, name } };
    }
    case "rms":
      return { analysis: scalarAnalysis(node, "RMS", Math.sqrt(meanValue(inputs[0].values.map((value) => value * value))), inputs[0].unit) };
    case "mean":
      return { analysis: scalarAnalysis(node, "Mean", meanValue(inputs[0].values), inputs[0].unit) };
    case "peak":
      return { analysis: scalarAnalysis(node, "Peak", Math.max(...inputs[0].values.map((value) => Math.abs(value)), 0), inputs[0].unit) };
    case "snr": {
      const signalPower = meanValue(inputs[0].values.map((value) => value * value));
      const noiseFloor = Math.max(asNumber(node.params.noiseFloor, 0.1), 1e-12);
      return { analysis: scalarAnalysis(node, "SNR", 10 * Math.log10(Math.max(signalPower, 1e-24) / (noiseFloor * noiseFloor)), "dB") };
    }
    case "dominantFrequency":
      return { analysis: scalarAnalysis(node, "Dominant Frequency", dominantFrequency(inputs[0]), "Hz") };
    case "bandwidth":
      return { analysis: scalarAnalysis(node, "Bandwidth", occupiedBandwidth(inputs[0], asNumber(node.params.threshold, 0.5)), "Hz") };
    case "stft":
      return {
        analysis: {
          type: "time-frequency-pending",
          id: node.id,
          name,
          method: "STFT",
          status: "pending",
          message: "Python/SciPy backend required.",
          params: { ...node.params }
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
          params: { ...node.params }
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

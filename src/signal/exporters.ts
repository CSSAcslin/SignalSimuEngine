import type { AnalysisResult, Signal, SignalGraph, SignalNode } from "./types";

export const exportCsv = (signal: Signal) => {
  const rows = ["time,value"];
  signal.time.forEach((time, index) => {
    rows.push(`${time},${signal.values[index] ?? 0}`);
  });
  return `${rows.join("\n")}\n`;
};

export const exportAnalysisCsv = (analysis: AnalysisResult) => {
  if (analysis.type === "scalar") {
    return `label,value,unit\n${analysis.label},${analysis.value},${analysis.unit}\n`;
  }

  if (analysis.type === "spectrum") {
    const rows = ["frequency,magnitude"];
    analysis.frequency.forEach((frequency, index) => {
      rows.push(`${frequency},${analysis.magnitude[index] ?? 0}`);
    });
    return `${rows.join("\n")}\n`;
  }

  return `method,status,message\n${analysis.method},${analysis.status},${analysis.message}\n`;
};

export const exportAnalysisJson = (analysis: AnalysisResult) => JSON.stringify(analysis, null, 2);

export const createNpyFloat64Bytes = (signal: Signal) => {
  const shape = `(${signal.values.length},)`;
  let header = `{'descr': '<f8', 'fortran_order': False, 'shape': ${shape}, }`;
  const magicLength = 6;
  const versionLength = 2;
  const headerLengthField = 2;
  const newlineLength = 1;
  const padding = 16 - ((magicLength + versionLength + headerLengthField + header.length + newlineLength) % 16);
  header = `${header}${" ".repeat(padding)}\n`;

  const buffer = new ArrayBuffer(magicLength + versionLength + headerLengthField + header.length + signal.values.length * 8);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const magic = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  bytes.set(magic, 0);
  bytes[6] = 1;
  bytes[7] = 0;
  view.setUint16(8, header.length, true);
  for (let index = 0; index < header.length; index += 1) bytes[10 + index] = header.charCodeAt(index);
  signal.values.forEach((value, index) => view.setFloat64(10 + header.length + index * 8, value, true));
  return bytes;
};

export const exportNpyFloat64 = (signal: Signal) => {
  const bytes = createNpyFloat64Bytes(signal);
  return new Blob([bytes], { type: "application/octet-stream" });
};

const pyParams = (node: SignalNode) => JSON.stringify(node.params ?? {});

const sourceLine = (node: SignalNode) => {
  if (node.type !== "source") return "";
  const params = pyParams(node);
  const base = `make_source('${node.kind}', ${node.sampleRate}, ${node.length}, ${params}, seed=${node.seed ?? "None"})`;
  return `nodes['${node.id}'] = ${base}`;
};

const operationLine = (node: SignalNode, inputs: string[]) => {
  if (node.type !== "operation") return "";
  const inputExpr = `[${inputs.map((id) => `nodes['${id}']`).join(", ")}]`;
  return `nodes['${node.id}'] = apply_operation('${node.kind}', ${inputExpr}, ${pyParams(node)})`;
};

export const exportPython = (graph: SignalGraph) => {
  const lines: string[] = [
    "import numpy as np",
    "",
    "def make_source(kind, sample_rate, length, params, seed=None):",
    "    t = np.arange(length) / sample_rate",
    "    amp = params.get('amplitude', 1)",
    "    freq = params.get('frequency', 1)",
    "    phase = params.get('phase', 0)",
    "    if kind == 'sine': return amp * np.sin(2 * np.pi * freq * t + phase)",
    "    if kind == 'triangle': return amp * (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * freq * t + phase))",
    "    if kind == 'square': return np.where(np.sin(2 * np.pi * freq * t + phase) >= 0, amp, -amp)",
    "    if kind == 'pulse': return np.where((t >= params.get('start', 0.1)) & (t <= params.get('start', 0.1) + params.get('width', 0.1)), amp, 0)",
    "    if kind == 'gaussianPulse':",
    "        sigma = max(params.get('sigma', 0.04), 1e-12)",
    "        return amp * np.exp(-0.5 * ((t - params.get('center', 0.2)) / sigma) ** 2)",
    "    if kind == 'chirp':",
    "        f0, f1 = params.get('startFrequency', 1), params.get('endFrequency', 20)",
    "        sweep = (f1 - f0) / max(length / sample_rate, 1 / sample_rate)",
    "        return amp * np.sin(2 * np.pi * (f0 * t + 0.5 * sweep * t * t))",
    "    if kind == 'noise':",
    "        rng = np.random.default_rng(seed)",
    "        return rng.uniform(-amp, amp, length)",
    "    if kind == 'constant': return np.full(length, params.get('value', 1))",
    "    if kind == 'import': return np.array(params.get('values', [0]), dtype=float)",
    "    return np.zeros(length)",
    "",
    "def align(inputs):",
    "    n = min(len(x) for x in inputs)",
    "    return [x[:n] for x in inputs]",
    "",
    "def apply_operation(kind, inputs, params):",
    "    if kind == 'add': return np.sum(np.vstack(align(inputs)), axis=0)",
    "    if kind == 'subtract':",
    "        a, b = align(inputs[:2])",
    "        return a - b",
    "    if kind == 'multiply': return np.prod(np.vstack(align(inputs)), axis=0)",
    "    if kind == 'scale': return inputs[0] * params.get('gain', 1)",
    "    if kind == 'delay': return np.concatenate([np.zeros(int(params.get('samples', 0))), inputs[0]])",
    "    if kind == 'convolve': return np.convolve(inputs[0], inputs[1], mode='full')",
    "    if kind == 'correlate': return np.correlate(inputs[0], inputs[1], mode='full')",
    "    if kind == 'normalize':",
    "        peak = np.max(np.abs(inputs[0])) if len(inputs[0]) else 0",
    "        return inputs[0] if peak == 0 else inputs[0] / peak",
    "    if kind == 'fft': return np.abs(np.fft.rfft(inputs[0]))",
    "    if kind == 'rms': return np.sqrt(np.mean(inputs[0] ** 2))",
    "    if kind == 'mean': return np.mean(inputs[0])",
    "    if kind == 'peak': return np.max(np.abs(inputs[0]))",
    "    if kind == 'snr':",
    "        noise = max(params.get('noiseFloor', 0.1), 1e-12)",
    "        return 10 * np.log10(max(np.mean(inputs[0] ** 2), 1e-24) / (noise * noise))",
    "    if kind == 'dominantFrequency':",
    "        mag = np.abs(np.fft.rfft(inputs[0]))",
    "        freqs = np.fft.rfftfreq(len(inputs[0]), d=1)",
    "        return freqs[1 + np.argmax(mag[1:])] if len(mag) > 1 else 0",
    "    if kind == 'bandwidth':",
    "        mag = np.abs(np.fft.rfft(inputs[0]))",
    "        freqs = np.fft.rfftfreq(len(inputs[0]), d=1)",
    "        cutoff = np.max(mag) * params.get('threshold', 0.5) if len(mag) else 0",
    "        bins = freqs[mag >= cutoff] if cutoff > 0 else []",
    "        return bins[-1] - bins[0] if len(bins) > 1 else 0",
    "    if kind in ('stft', 'cwt'): raise RuntimeError('Python/SciPy backend execution is required for time-frequency analysis.')",
    "    return inputs[0]",
    "",
    "nodes = {}"
  ];

  graph.nodes.forEach((node) => {
    if (node.type === "source") lines.push(sourceLine(node));
    else {
      const inputs = graph.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from);
      lines.push(operationLine(node, inputs));
    }
  });

  const finalNode = graph.selectedNodeId ?? graph.nodes[graph.nodes.length - 1]?.id;
  if (finalNode) lines.push(`final = nodes['${finalNode}']`);
  lines.push("print(final)");

  return `${lines.join("\n")}\n`;
};

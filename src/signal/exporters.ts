import type { AnalysisResult, Signal, SignalGraph, SignalNode } from "./types";

const csvComments = (lines: string[]) => `${lines.map((line) => `# ${line}`).join("\n")}\n`;

export const exportCsv = (signal: Signal) => {
  const rows = [
    csvComments([
      "SignalForge signal export",
      `node=${signal.provenance?.nodeId ?? signal.id}`,
      `sampleRate=${signal.sampleRate}`,
      `unit=${signal.unit}`,
      `params=${JSON.stringify(signal.params ?? {})}`
    ]).trimEnd(),
    "time,value"
  ];
  signal.time.forEach((time, index) => {
    rows.push(`${time},${signal.values[index] ?? 0}`);
  });
  return `${rows.join("\n")}\n`;
};

export const exportAnalysisCsv = (analysis: AnalysisResult, format: "long" | "matrix" = "long") => {
  const header = csvComments([
    "SignalForge analysis export",
    `node=${analysis.provenance?.nodeId ?? analysis.id}`,
    `type=${analysis.type}`,
    `params=${JSON.stringify(analysis.params ?? {})}`
  ]).trimEnd();

  if (analysis.type === "scalar") {
    return `${header}\nlabel,value,unit\n${analysis.label},${analysis.value},${analysis.unit}\n`;
  }

  if (analysis.type === "spectrum") {
    const rows = [header, "frequency,magnitude"];
    analysis.frequency.forEach((frequency, index) => {
      rows.push(`${frequency},${analysis.magnitude[index] ?? 0}`);
    });
    return `${rows.join("\n")}\n`;
  }

  if (analysis.type === "summary") {
    const rows = [header, "label,value,unit"];
    analysis.metrics.forEach((metric) => rows.push(`${metric.label},${metric.value},${metric.unit}`));
    return `${rows.join("\n")}\n`;
  }

  if (analysis.type === "distribution") {
    const rows = [header, "binStart,binEnd,count,density"];
    analysis.counts.forEach((count, index) => {
      rows.push(`${analysis.binEdges[index] ?? 0},${analysis.binEdges[index + 1] ?? 0},${count},${analysis.density[index] ?? 0}`);
    });
    return `${rows.join("\n")}\n`;
  }

  if (analysis.type === "time-frequency") {
    if (format === "matrix") {
      const rows = [header, `frequency\\time,${analysis.time.join(",")}`];
      analysis.frequency.forEach((frequency, rowIndex) => {
        rows.push(`${frequency},${analysis.time.map((_, columnIndex) => analysis.power[rowIndex]?.[columnIndex] ?? 0).join(",")}`);
      });
      return `${rows.join("\n")}\n`;
    }
    const rows = [header, "frequency,time,power"];
    analysis.frequency.forEach((frequency, rowIndex) => {
      analysis.time.forEach((time, columnIndex) => {
        rows.push(`${frequency},${time},${analysis.power[rowIndex]?.[columnIndex] ?? 0}`);
      });
    });
    return `${rows.join("\n")}\n`;
  }

  return `${header}\nmethod,status,message\n${analysis.method},${analysis.status},${analysis.message}\n`;
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

const operationLine = (node: SignalNode, inputs: string[], sampleRate: number) => {
  if (node.type !== "operation") return "";
  const inputExpr = `[${inputs.map((id) => `nodes['${id}']`).join(", ")}]`;
  return `nodes['${node.id}'] = apply_operation('${node.kind}', ${inputExpr}, {**${pyParams(node)}, '__sampleRate': ${sampleRate}})`;
};

export const exportPython = (graph: SignalGraph) => {
  const lines: string[] = [
    "# SignalForge Python reproduction script",
    "# Protocol: SignalForge 1D Signal Protocol v3",
    "# Time-frequency nodes require SciPy-compatible execution.",
    "import numpy as np",
    "",
    "def safe_expression(expr, scope):",
    "    allowed = {",
    "        'np': np, 'pi': np.pi, 'e': np.e,",
    "        'sin': np.sin, 'cos': np.cos, 'tan': np.tan,",
    "        'asin': np.arcsin, 'acos': np.arccos, 'atan': np.arctan,",
    "        'exp': np.exp, 'log': np.log, 'sqrt': np.sqrt, 'abs': np.abs,",
    "        'min': np.minimum, 'max': np.maximum, 'pow': np.power,",
    "        'floor': np.floor, 'ceil': np.ceil, 'round': np.round",
    "    }",
    "    allowed.update(scope)",
    "    return eval(str(expr).replace('^', '**'), {'__builtins__': {}}, allowed)",
    "",
    "def make_source(kind, sample_rate, length, params, seed=None):",
    "    t = np.arange(length) / sample_rate",
    "    n = np.arange(length)",
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
    "    if kind == 'customSource':",
    "        return np.asarray(safe_expression(params.get('expression', 'p0 * sin(2*pi*p1*t + p2)'), {",
    "            't': t, 'n': n, 'sampleRate': sample_rate,",
    "            'p0': params.get('p0', 1), 'p1': params.get('p1', 5), 'p2': params.get('p2', 0)",
    "        }), dtype=float)",
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
    "    if kind == 'customExpression':",
    "        aligned = align(inputs)",
    "        x = aligned[0]",
    "        sample_rate = params.get('__sampleRate', params.get('sampleRate', 1))",
    "        t = np.arange(len(x)) / sample_rate",
    "        input_scope = {f'x{index}': value for index, value in enumerate(aligned)}",
    "        return np.asarray(safe_expression(params.get('expression', 'x0 + p0 * x1'), {",
    "            **input_scope, 'x': x, 't': t, 'n': np.arange(len(x)), 'sampleRate': sample_rate,",
    "            'p0': params.get('p0', 1), 'p1': params.get('p1', 0), 'p2': params.get('p2', 0)",
    "        }), dtype=float)",
    "    if kind == 'externalCommand': raise RuntimeError('External Command nodes require the SignalForge desktop runner protocol.')",
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
    "    if kind == 'quantiles':",
    "        p = min(100, max(0, params.get('percentile', 50)))",
    "        return {'Mean': float(np.mean(inputs[0])), 'Min': float(np.min(inputs[0])), 'Max': float(np.max(inputs[0])), f'P{p:g}': float(np.percentile(inputs[0], p))}",
    "    if kind == 'distribution':",
    "        bins = int(min(200, max(1, params.get('bins', 24))))",
    "        counts, edges = np.histogram(inputs[0], bins=bins)",
    "        density = counts / max(len(inputs[0]), 1)",
    "        return {'binEdges': edges.tolist(), 'counts': counts.tolist(), 'density': density.tolist()}",
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
      lines.push(operationLine(node, inputs, graph.sampleRate ?? 1));
    }
  });

  const finalNode = graph.selectedNodeId ?? graph.nodes[graph.nodes.length - 1]?.id;
  if (finalNode) lines.push(`final = nodes['${finalNode}']`);
  lines.push("print(final)");

  return `${lines.join("\n")}\n`;
};

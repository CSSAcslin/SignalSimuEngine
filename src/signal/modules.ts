import type { ModuleDefinition } from "./types";

export const moduleDefinitions: ModuleDefinition[] = [
  {
    kind: "sine",
    type: "source",
    label: "Sine",
    description: "Sinusoidal waveform with amplitude, frequency, and phase.",
    inputCount: 0,
    params: [
      { key: "frequency", label: "Frequency", type: "number", defaultValue: 5, min: 0, step: 0.1, unit: "Hz" },
      { key: "amplitude", label: "Amplitude", type: "number", defaultValue: 1, step: 0.1 },
      { key: "phase", label: "Phase", type: "number", defaultValue: 0, step: 0.1, unit: "rad" }
    ]
  },
  {
    kind: "triangle",
    type: "source",
    label: "Triangle",
    description: "Bipolar triangle waveform with amplitude, frequency, and phase.",
    inputCount: 0,
    params: [
      { key: "frequency", label: "Frequency", type: "number", defaultValue: 5, min: 0, step: 0.1, unit: "Hz" },
      { key: "amplitude", label: "Amplitude", type: "number", defaultValue: 1, step: 0.1 },
      { key: "phase", label: "Phase", type: "number", defaultValue: 0, step: 0.1, unit: "rad" }
    ]
  },
  {
    kind: "square",
    type: "source",
    label: "Square",
    description: "Bipolar square wave.",
    inputCount: 0,
    params: [
      { key: "frequency", label: "Frequency", type: "number", defaultValue: 3, min: 0, step: 0.1, unit: "Hz" },
      { key: "amplitude", label: "Amplitude", type: "number", defaultValue: 0.7, step: 0.1 }
    ]
  },
  {
    kind: "pulse",
    type: "source",
    label: "Pulse",
    description: "Single rectangular pulse.",
    inputCount: 0,
    params: [
      { key: "start", label: "Start", type: "number", defaultValue: 0.15, min: 0, step: 0.01, unit: "s" },
      { key: "width", label: "Width", type: "number", defaultValue: 0.08, min: 0, step: 0.01, unit: "s" },
      { key: "amplitude", label: "Amplitude", type: "number", defaultValue: 1, step: 0.1 }
    ]
  },
  {
    kind: "gaussianPulse",
    type: "source",
    label: "Gaussian Pulse",
    description: "Single Gaussian pulse with center, width, and amplitude.",
    inputCount: 0,
    params: [
      { key: "center", label: "Center", type: "number", defaultValue: 0.2, min: 0, step: 0.01, unit: "s" },
      { key: "sigma", label: "Sigma", type: "number", defaultValue: 0.04, min: 0.000001, step: 0.01, unit: "s" },
      { key: "amplitude", label: "Amplitude", type: "number", defaultValue: 1, step: 0.1 }
    ]
  },
  {
    kind: "chirp",
    type: "source",
    label: "Chirp",
    description: "Linear frequency sweep.",
    inputCount: 0,
    params: [
      { key: "startFrequency", label: "Start Freq", type: "number", defaultValue: 2, min: 0, step: 0.1, unit: "Hz" },
      { key: "endFrequency", label: "End Freq", type: "number", defaultValue: 40, min: 0, step: 0.1, unit: "Hz" },
      { key: "amplitude", label: "Amplitude", type: "number", defaultValue: 0.6, step: 0.1 }
    ]
  },
  {
    kind: "noise",
    type: "source",
    label: "White Noise",
    description: "Seeded uniform white noise.",
    inputCount: 0,
    params: [{ key: "amplitude", label: "Amplitude", type: "number", defaultValue: 0.2, min: 0, step: 0.05 }]
  },
  {
    kind: "photonCounts",
    type: "source",
    label: "Photon Counts",
    description: "Coherent or thermal-light photon counts with detector shot noise, efficiency, and dark counts.",
    inputCount: 0,
    params: [
      {
        key: "lightStatistics",
        label: "Light Statistics",
        type: "select",
        defaultValue: "coherent",
        options: [
          { label: "Coherent (Poisson)", value: "coherent" },
          { label: "Thermal (Chaotic)", value: "thermal" }
        ]
      },
      { key: "baselineRate", label: "Baseline Rate", type: "number", defaultValue: 100000, min: 0, step: 1000, unit: "counts/s" },
      { key: "coherenceTime", label: "Coherence Time", type: "number", defaultValue: 0.01, min: 0, step: 0.001, unit: "s" },
      { key: "quantumEfficiency", label: "Quantum Efficiency", type: "number", defaultValue: 1, min: 0, max: 1, step: 0.01 },
      { key: "darkCountRate", label: "Dark Count Rate", type: "number", defaultValue: 0, min: 0, step: 10, unit: "counts/s" },
      { key: "modulationDepth", label: "Mod Depth", type: "number", defaultValue: 0, min: 0, max: 1, step: 0.01 },
      { key: "modulationFrequency", label: "Mod Frequency", type: "number", defaultValue: 1, min: 0, step: 0.1, unit: "Hz" },
      { key: "relativeIntensityNoise", label: "Rel Intensity Noise", type: "number", defaultValue: 0, min: 0, step: 0.01 },
      {
        key: "outputMode",
        label: "Output Mode",
        type: "select",
        defaultValue: "counts",
        options: [
          { label: "Counts per sample", value: "counts" },
          { label: "Estimated rate", value: "rate" }
        ]
      }
    ]
  },
  {
    kind: "constant",
    type: "source",
    label: "Constant",
    description: "Constant baseline value.",
    inputCount: 0,
    params: [{ key: "value", label: "Value", type: "number", defaultValue: 1, step: 0.1 }]
  },
  {
    kind: "import",
    type: "source",
    label: "Import Array",
    description: "Inline numeric array for quick experiments.",
    inputCount: 0,
    params: [{ key: "values", label: "Values", type: "array", defaultValue: [1, 0, -1, 0] }]
  },
  {
    kind: "customSource",
    type: "source",
    label: "Custom Source",
    description: "Safe expression source using t, n, sampleRate, and p0/p1/p2.",
    inputCount: 0,
    params: [
      { key: "expression", label: "Expression", type: "text", defaultValue: "p0 * sin(2*pi*p1*t + p2)" },
      { key: "p0", label: "p0", type: "number", defaultValue: 1, step: 0.1 },
      { key: "p1", label: "p1", type: "number", defaultValue: 5, step: 0.1 },
      { key: "p2", label: "p2", type: "number", defaultValue: 0, step: 0.1 }
    ]
  },
  {
    kind: "add",
    type: "operation",
    label: "Add",
    description: "Element-wise addition.",
    inputCount: "many",
    params: []
  },
  {
    kind: "subtract",
    type: "operation",
    label: "Subtract",
    description: "Subtract second input from first input.",
    inputCount: 2,
    params: []
  },
  {
    kind: "multiply",
    type: "operation",
    label: "Multiply",
    description: "Element-wise multiplication.",
    inputCount: "many",
    params: []
  },
  {
    kind: "scale",
    type: "operation",
    label: "Scale",
    description: "Multiply a signal by a scalar gain.",
    inputCount: 1,
    params: [{ key: "gain", label: "Gain", type: "number", defaultValue: 1.5, step: 0.1 }]
  },
  {
    kind: "customExpression",
    type: "operation",
    label: "Custom Expression",
    description: "Safe multi-input expression using x0, x1, t, n, sampleRate, and p0/p1/p2.",
    inputCount: "many",
    params: [
      { key: "expression", label: "Expression", type: "text", defaultValue: "x0 + p0 * x1" },
      { key: "p0", label: "p0", type: "number", defaultValue: 1, step: 0.1 },
      { key: "p1", label: "p1", type: "number", defaultValue: 0, step: 0.1 },
      { key: "p2", label: "p2", type: "number", defaultValue: 0, step: 0.1 }
    ]
  },
  {
    kind: "externalCommand",
    type: "operation",
    label: "External Command",
    description: "Run a packaged executable module through the desktop shell protocol.",
    inputCount: "many",
    params: [
      { key: "executablePath", label: "Executable Path", type: "text", defaultValue: "" },
      { key: "arguments", label: "Arguments", type: "text", defaultValue: "--input {input} --output {output}" },
      { key: "timeoutMs", label: "Timeout", type: "number", defaultValue: 30000, min: 1000, step: 1000, unit: "ms" },
      { key: "p0", label: "p0", type: "number", defaultValue: 0, step: 0.1 },
      { key: "p1", label: "p1", type: "number", defaultValue: 0, step: 0.1 },
      { key: "p2", label: "p2", type: "number", defaultValue: 0, step: 0.1 }
    ]
  },
  {
    kind: "delay",
    type: "operation",
    label: "Delay",
    description: "Shift a signal by samples.",
    inputCount: 1,
    params: [{ key: "samples", label: "Samples", type: "number", defaultValue: 16, step: 1, unit: "samples" }]
  },
  {
    kind: "convolve",
    type: "operation",
    label: "Convolve",
    description: "Full discrete convolution.",
    inputCount: 2,
    params: []
  },
  {
    kind: "correlate",
    type: "operation",
    label: "Cross Correlate",
    description: "Full cross-correlation.",
    inputCount: 2,
    params: []
  },
  {
    kind: "fft",
    type: "analysis",
    outputType: "spectrum",
    label: "FFT Spectrum",
    description: "Magnitude spectrum for analysis.",
    inputCount: 1,
    params: []
  },
  {
    kind: "normalize",
    type: "operation",
    label: "Normalize",
    description: "Scale by maximum absolute value.",
    inputCount: 1,
    params: []
  },
  {
    kind: "rms",
    type: "analysis",
    outputType: "scalar",
    label: "RMS",
    description: "Root mean square amplitude.",
    inputCount: 1,
    params: []
  },
  {
    kind: "quantiles",
    type: "analysis",
    outputType: "summary",
    label: "Quantiles",
    description: "Mean, min, max, and a selected percentile.",
    inputCount: 1,
    params: [{ key: "percentile", label: "Percentile", type: "number", defaultValue: 50, min: 0, max: 100, step: 1, unit: "%" }]
  },
  {
    kind: "distribution",
    type: "analysis",
    outputType: "distribution",
    label: "Distribution",
    description: "Histogram counts and density over amplitude bins.",
    inputCount: 1,
    params: [{ key: "bins", label: "Bins", type: "number", defaultValue: 24, min: 1, max: 200, step: 1 }]
  },
  {
    kind: "snr",
    type: "analysis",
    outputType: "scalar",
    label: "SNR",
    description: "Signal-to-noise ratio against a configured noise floor.",
    inputCount: 1,
    params: [{ key: "noiseFloor", label: "Noise Floor", type: "number", defaultValue: 0.1, min: 0.000001, step: 0.01 }]
  },
  {
    kind: "dominantFrequency",
    type: "analysis",
    outputType: "scalar",
    label: "Dominant Frequency",
    description: "Frequency bin with the highest non-DC magnitude.",
    inputCount: 1,
    params: []
  },
  {
    kind: "bandwidth",
    type: "analysis",
    outputType: "scalar",
    label: "Bandwidth",
    description: "Occupied bandwidth above a relative magnitude threshold.",
    inputCount: 1,
    params: [{ key: "threshold", label: "Threshold", type: "number", defaultValue: 0.5, min: 0, max: 1, step: 0.05 }]
  },
  {
    kind: "secondOrderCorrelation",
    type: "analysis",
    outputType: "scalar",
    label: "G2 Correlation",
    description: "Second-order auto/cross correlation at a fixed lag, over time, or scanned versus delay.",
    inputCount: "many",
    params: [
      {
        key: "correlationType",
        label: "Correlation Type",
        type: "select",
        defaultValue: "auto",
        options: [
          { label: "Autocorrelation", value: "auto" },
          { label: "Cross-correlation", value: "cross" }
        ]
      },
      {
        key: "outputMode",
        label: "Output Mode",
        type: "select",
        defaultValue: "averageAtLag",
        options: [
          { label: "Average at Lag", value: "averageAtLag" },
          { label: "Curve vs Delay (tau)", value: "curveOverLag" }
        ]
      },
      {
        key: "estimator",
        label: "Estimator",
        type: "select",
        defaultValue: "intensity",
        options: [
          { label: "Intensity Product", value: "intensity" },
          { label: "Photon Counting (Normal Ordered)", value: "photonCounting" }
        ]
      },
      {
        key: "normalization",
        label: "Normalization",
        type: "select",
        defaultValue: "normalized",
        options: [
          { label: "Normalized g2", value: "normalized" },
          { label: "Raw product", value: "raw" }
        ]
      },
      { key: "lagSamples", label: "Lag", type: "number", defaultValue: 0, min: 0, step: 1, unit: "samples" },
      { key: "maxLagSamples", label: "Maximum Lag", type: "number", defaultValue: 100, min: 0, step: 1, unit: "samples" }
    ]
  },
  {
    kind: "stft",
    type: "analysis",
    outputType: "time-frequency",
    label: "STFT",
    description: "Short-time Fourier transform analysis via the Python backend.",
    inputCount: 1,
    params: [
      { key: "windowSize", label: "Window Size", type: "number", defaultValue: 128, min: 8, step: 1, unit: "samples" },
      { key: "hopSize", label: "Hop Size", type: "number", defaultValue: 32, min: 1, step: 1, unit: "samples" }
    ]
  },
  {
    kind: "cwt",
    type: "analysis",
    outputType: "time-frequency",
    label: "CWT",
    description: "Continuous wavelet transform analysis via the Python backend.",
    inputCount: 1,
    params: [
      { key: "wavelet", label: "Wavelet", type: "select", defaultValue: "morlet", options: [{ label: "Morlet", value: "morlet" }] },
      { key: "voicesPerOctave", label: "Voices / Oct", type: "number", defaultValue: 12, min: 1, step: 1 }
    ]
  }
];

export const getModuleDefinition = (kind: string) => moduleDefinitions.find((definition) => definition.kind === kind);

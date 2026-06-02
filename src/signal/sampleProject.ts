import type { SignalGraph } from "./types";

export const sampleGraph: SignalGraph = {
  schemaVersion: 2,
  sampleRate: 1000,
  samples: 1000,
  selectedNodeId: "normalize-output",
  displayNodeId: "normalize-output",
  nodes: [
    {
      id: "carrier",
      type: "source",
      kind: "sine",
      name: "Carrier Sine",
      position: { x: 80, y: 86 },
      timelineOffset: 0,
      sampleRate: 1000,
      length: 1000,
      params: { frequency: 12, amplitude: 1, phase: 0 }
    },
    {
      id: "chirp-a",
      type: "source",
      kind: "chirp",
      name: "Linear Chirp",
      position: { x: 82, y: 242 },
      timelineOffset: 0.08,
      sampleRate: 1000,
      length: 1000,
      params: { startFrequency: 4, endFrequency: 80, amplitude: 0.55 }
    },
    {
      id: "noise-bed",
      type: "source",
      kind: "noise",
      name: "Noise Bed",
      position: { x: 82, y: 398 },
      timelineOffset: 0,
      sampleRate: 1000,
      length: 1000,
      seed: 19,
      params: { amplitude: 0.16 }
    },
    {
      id: "multiply-mod",
      type: "operation",
      kind: "multiply",
      name: "Multiply",
      position: { x: 380, y: 170 },
      timelineOffset: 0,
      params: {}
    },
    {
      id: "mix-noise",
      type: "operation",
      kind: "add",
      name: "Add Noise",
      position: { x: 658, y: 288 },
      timelineOffset: 0,
      params: {}
    },
    {
      id: "normalize-output",
      type: "operation",
      kind: "normalize",
      name: "Normalize Output",
      position: { x: 928, y: 288 },
      timelineOffset: 0,
      params: {}
    }
  ],
  edges: [
    { id: "e-carrier-multiply", from: "carrier", to: "multiply-mod" },
    { id: "e-chirp-multiply", from: "chirp-a", to: "multiply-mod" },
    { id: "e-multiply-add", from: "multiply-mod", to: "mix-noise" },
    { id: "e-noise-add", from: "noise-bed", to: "mix-noise" },
    { id: "e-add-normalize", from: "mix-noise", to: "normalize-output" }
  ]
};

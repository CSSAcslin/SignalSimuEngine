import { describe, expect, it } from "vitest";
import { createCustomExpressionInputRows, isEditableEventTarget } from "../src/ui/inspectorHelpers";
import type { SignalGraph } from "../src/signal";

describe("inspector interaction helpers", () => {
  it("treats form controls and contenteditable elements as editable targets", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const button = document.createElement("button");

    expect(isEditableEventTarget(input)).toBe(true);
    expect(isEditableEventTarget(textarea)).toBe(true);
    expect(isEditableEventTarget(select)).toBe(true);
    expect(isEditableEventTarget(editable)).toBe(true);
    expect(isEditableEventTarget(button)).toBe(false);
    expect(isEditableEventTarget(null)).toBe(false);
  });

  it("maps custom expression inputs to stable x0/x1 variable names in edge order", () => {
    const graph: SignalGraph = {
      nodes: [
        { id: "a", name: "Sine A", type: "source", kind: "sine", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 100, length: 2, params: {} },
        { id: "b", name: "Noise B", type: "source", kind: "noise", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 100, length: 2, params: {} },
        { id: "custom", name: "Custom Expression", type: "operation", kind: "customExpression", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} }
      ],
      edges: [
        { id: "b-custom", from: "b", to: "custom" },
        { id: "a-custom", from: "a", to: "custom" }
      ]
    };
    const signals = new Map([
      ["a", { id: "a", name: "Sine A", sampleRate: 100, unit: "a.u.", time: [0, 0.01], values: [1, 2], params: {} }],
      ["b", { id: "b", name: "Noise B", sampleRate: 100, unit: "a.u.", time: [0, 0.01], values: [3, 4], params: {} }]
    ]);

    expect(createCustomExpressionInputRows(graph, "custom", signals)).toEqual([
      { variable: "x0", nodeName: "Noise B", detail: "100 Hz · 2 samples", available: true },
      { variable: "x1", nodeName: "Sine A", detail: "100 Hz · 2 samples", available: true }
    ]);
  });
});

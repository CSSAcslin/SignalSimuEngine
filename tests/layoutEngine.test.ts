import { beforeAll, describe, expect, it } from "vitest";
import type { SignalGraph, SignalGraphLayout, SignalNode } from "../src/signal";

let computeSignalGraphLayout: (graph: SignalGraph) => Promise<SignalGraphLayout>;

beforeAll(async () => {
  const { Worker: ElkTestWorker } = await import("elkjs/lib/elk-worker.min.js");
  globalThis.Worker = ElkTestWorker as unknown as typeof Worker;
  ({ computeSignalGraphLayout } = await import("../src/signal/layoutEngine"));
});

const node = (id: string, type: SignalNode["type"] = "operation"): SignalNode =>
  type === "source"
    ? {
        id,
        type: "source",
        kind: "constant",
        name: id,
        position: { x: 0, y: 0 },
        timelineOffset: 0,
        sampleRate: 1000,
        length: 1000,
        params: { value: 1 }
      }
    : {
        id,
        type: "operation",
        kind: "scale",
        name: id,
        position: { x: 0, y: 0 },
        timelineOffset: 0,
        params: { gain: 1 }
      };

const rectanglesOverlap = (
  left: { x: number; y: number },
  right: { x: number; y: number }
) =>
  left.x < right.x + 176 &&
  left.x + 176 > right.x &&
  left.y < right.y + 112 &&
  left.y + 112 > right.y;

describe("asynchronous signal graph layout", () => {
  it("keeps connected workflows compact without overlapping nodes", async () => {
    const graph: SignalGraph = {
      nodes: [node("a", "source"), node("b", "source"), node("mix"), node("filter"), node("fft"), node("stats")],
      edges: [
        { id: "a-mix", from: "a", to: "mix" },
        { id: "b-mix", from: "b", to: "mix" },
        { id: "mix-filter", from: "mix", to: "filter" },
        { id: "filter-fft", from: "filter", to: "fft" },
        { id: "filter-stats", from: "filter", to: "stats" }
      ]
    };

    const layout = await computeSignalGraphLayout(graph);
    const positions = graph.nodes.map((item) => layout.positions[item.id]);

    positions.forEach((position) => expect(position).toBeDefined());
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        expect(rectanglesOverlap(positions[left], positions[right])).toBe(false);
      }
    }
    expect(Math.max(...positions.map((position) => position.x)) - Math.min(...positions.map((position) => position.x))).toBeLessThan(1100);
  }, 15_000);

  it("keeps explicit groups together in a compact layout", async () => {
    const graph: SignalGraph = {
      nodes: [node("a", "source"), node("b"), node("c"), node("d")],
      edges: [
        { id: "a-b", from: "a", to: "b" },
        { id: "b-c", from: "b", to: "c" },
        { id: "c-d", from: "c", to: "d" }
      ],
      groups: [{ id: "group-one", name: "Group One", nodeIds: ["b", "c"] }]
    };

    const layout = await computeSignalGraphLayout(graph);
    const b = layout.positions.b;
    const c = layout.positions.c;

    expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeLessThan(500);
  }, 15_000);
});

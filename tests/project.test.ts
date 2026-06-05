import { describe, expect, it } from "vitest";
import { migrateProjectGraph, parseProjectJson, serializeProjectGraph } from "../src/signal";

describe("project JSON migration", () => {
  it("migrates legacy graphs to schema v2 and removes dangling edges", () => {
    const graph = migrateProjectGraph({
      sampleRate: 200,
      samples: 400,
      selectedNodeId: "cos",
      nodes: [
        {
          id: "cos",
          type: "source",
          kind: "cosine",
          name: "Legacy Cosine",
          position: { x: 1, y: 2 },
          sampleRate: 200,
          length: 400,
          params: { frequency: 3, amplitude: 2, phase: 0.25 }
        }
      ],
      edges: [{ id: "bad", from: "cos", to: "missing" }]
    });

    expect(graph.schemaVersion).toBe(2);
    expect(graph.edges).toEqual([]);
    expect(graph.displayNodeId).toBe("cos");
    expect(graph.nodes[0]).toMatchObject({ type: "source", kind: "sine" });
    expect(graph.nodes[0].params.phase).toBeCloseTo(0.25 + Math.PI / 2);
  });

  it("parses and serializes project JSON with reproducibility metadata", () => {
    const graph = parseProjectJson(
      JSON.stringify({
        nodes: [{ id: "x", type: "source", kind: "import", name: "X", position: { x: 0, y: 0 }, params: { values: [1] }, sampleRate: 1, length: 1 }],
        edges: []
      })
    );
    const serialized = JSON.parse(serializeProjectGraph(graph));

    expect(serialized.schemaVersion).toBe(2);
    expect(serialized.protocol.name).toBe("SignalForge 1D Signal Protocol");
    expect(serialized.protocol.version).toBe(3);
    expect(serialized.metadata.app).toBe("SignalForge");
    expect(serialized.metadata.backend.analysisServiceUrl).toBe("http://127.0.0.1:8765");
    expect(serialized.metadata.nodeCount).toBe(1);
  });

  it("preserves external command node invocation parameters in project JSON", () => {
    const graph = parseProjectJson(
      JSON.stringify({
        sampleRate: 1000,
        samples: 1000,
        nodes: [
          { id: "x", type: "source", kind: "import", name: "X", position: { x: 0, y: 0 }, params: { values: [1] }, sampleRate: 1, length: 1 },
          {
            id: "external",
            type: "operation",
            kind: "externalCommand",
            name: "External Command",
            position: { x: 120, y: 80 },
            timelineOffset: 0,
            params: {
              executablePath: "H:/tools/filter.exe",
              arguments: "--input {input} --output {output}",
              timeoutMs: 45000,
              p0: 2
            }
          }
        ],
        edges: [{ id: "x-external", from: "x", to: "external" }]
      })
    );

    const restored = parseProjectJson(serializeProjectGraph(graph));
    const node = restored.nodes.find((item) => item.id === "external");

    expect(node).toMatchObject({
      type: "operation",
      kind: "externalCommand",
      params: {
        executablePath: "H:/tools/filter.exe",
        arguments: "--input {input} --output {output}",
        timeoutMs: 45000,
        p0: 2
      }
    });
  });
});

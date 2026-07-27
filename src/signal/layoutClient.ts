import type { SignalGraph } from "./types";
import type { SignalGraphLayout } from "./layoutEngine";

export const layoutSignalGraph = async (graph: SignalGraph): Promise<SignalGraphLayout> => {
  const { computeSignalGraphLayout } = await import("./layoutEngine");
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Auto layout timed out.")), 20_000);
  });
  try {
    return await Promise.race([computeSignalGraphLayout(graph), timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
};

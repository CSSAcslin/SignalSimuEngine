import type { OperationNode, ParamValue, Signal, TimeFrequencyAnalysisResult, TimeFrequencyErrorResult } from "./types";

export type TimeFrequencyBackendRequest = {
  nodeId: string;
  name: string;
  method: "STFT" | "CWT";
  sampleRate: number;
  values: number[];
  params: Record<string, ParamValue>;
};

export type TimeFrequencyBackendResponse = {
  time: number[];
  frequency: number[];
  power: number[][];
  unit?: string;
};

type TauriWindow = Window &
  typeof globalThis & {
    __TAURI__?: {
      core?: {
        invoke?: <T>(command: string, args: Record<string, unknown>) => Promise<T>;
      };
    };
  };

export const isTimeFrequencyNode = (node?: OperationNode) => node?.kind === "stft" || node?.kind === "cwt";

export const createTimeFrequencyRequest = (node: OperationNode, signal: Signal): TimeFrequencyBackendRequest => ({
  nodeId: node.id,
  name: node.name,
  method: node.kind === "cwt" ? "CWT" : "STFT",
  sampleRate: signal.sampleRate,
  values: signal.values,
  params: { ...node.params }
});

export const runTimeFrequencyBackend = async (request: TimeFrequencyBackendRequest): Promise<TimeFrequencyAnalysisResult | TimeFrequencyErrorResult> => {
  const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
  if (!invoke) {
    return {
      type: "time-frequency-error",
      id: request.nodeId,
      name: request.name,
      method: request.method,
      status: "error",
      message: "STFT/CWT require the Tauri desktop backend. Start the app with pnpm tauri:dev instead of the plain Vite browser preview.",
      params: request.params
    };
  }

  try {
    const response = await invoke<TimeFrequencyBackendResponse>("run_time_frequency_analysis", { request });
    return {
      type: "time-frequency",
      id: request.nodeId,
      name: request.name,
      method: request.method,
      status: "done",
      time: response.time,
      frequency: response.frequency,
      power: response.power,
      unit: response.unit ?? "power",
      params: request.params
    };
  } catch (error) {
    return {
      type: "time-frequency-error",
      id: request.nodeId,
      name: request.name,
      method: request.method,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      params: request.params
    };
  }
};

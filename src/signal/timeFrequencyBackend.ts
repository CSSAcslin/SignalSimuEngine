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

const LOCAL_ANALYSIS_BACKEND_URL = "http://127.0.0.1:8765";

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
    return runBrowserTimeFrequencyBackend(request);
  }

  try {
    return await fetchHttpTimeFrequencyBackend(request);
  } catch {
    // Tauri can still use its direct Python command while the sidecar service is not wired yet.
  }

  try {
    const response = await invoke<TimeFrequencyBackendResponse>("run_time_frequency_analysis", { request });
    return toTimeFrequencyResult(request, response);
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

const runBrowserTimeFrequencyBackend = async (request: TimeFrequencyBackendRequest): Promise<TimeFrequencyAnalysisResult | TimeFrequencyErrorResult> => {
  try {
    return await fetchHttpTimeFrequencyBackend(request);
  } catch (error) {
    return {
      type: "time-frequency-error",
      id: request.nodeId,
      name: request.name,
      method: request.method,
      status: "error",
      message: `Local analysis backend is offline. Start it with pnpm backend:dev, then keep using the web workspace. ${error instanceof Error ? error.message : String(error)}`,
      params: request.params
    };
  }
};

const fetchHttpTimeFrequencyBackend = async (request: TimeFrequencyBackendRequest): Promise<TimeFrequencyAnalysisResult> => {
  const response = await fetch(`${LOCAL_ANALYSIS_BACKEND_URL}/analyze/time-frequency`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return toTimeFrequencyResult(request, await response.json() as TimeFrequencyBackendResponse);
};

const toTimeFrequencyResult = (request: TimeFrequencyBackendRequest, response: TimeFrequencyBackendResponse): TimeFrequencyAnalysisResult => ({
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
});

from pathlib import Path
import importlib.util
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class TimeFrequencyRequest(BaseModel):
    nodeId: str | None = None
    name: str | None = None
    method: str
    sampleRate: float = Field(gt=0)
    values: list[float]
    params: dict[str, Any] = Field(default_factory=dict)


app = FastAPI(title="SignalForge Analysis Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _load_time_frequency_module():
    script_path = Path(__file__).resolve().parents[1] / "src-tauri" / "python" / "time_frequency.py"
    spec = importlib.util.spec_from_file_location("signalforge_time_frequency", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load time-frequency module from {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@app.get("/health")
def health():
    return {"status": "ok", "service": "signalforge-analysis"}


@app.post("/analyze/time-frequency")
def analyze_time_frequency(request: TimeFrequencyRequest):
    try:
        module = _load_time_frequency_module()
        np, signal = module._require_scipy()
        values = np.asarray(request.values, dtype=float)
        if values.size == 0:
            raise RuntimeError("Time-frequency backend received an empty signal.")

        method = request.method.upper()
        if method == "STFT":
            time, frequency, power = module.run_stft(np, signal, values, request.sampleRate, request.params)
        elif method == "CWT":
            time, frequency, power = module.run_cwt(np, signal, values, request.sampleRate, request.params)
        else:
            raise RuntimeError(f"Unsupported time-frequency method: {request.method}")

        return {
            "time": time.tolist(),
            "frequency": frequency.tolist(),
            "power": power.tolist(),
            "unit": "power",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

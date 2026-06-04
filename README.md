# SignalForge MVP

SignalForge is a local scientific workstation for building one-dimensional simulated signals with modular sources, operation nodes, timeline alignment, live previews, and reproducible exports.

## Current MVP

- React + TypeScript + Vite web workstation, with an optional Tauri desktop shell.
- Local Python/FastAPI analysis backend for SciPy-powered STFT and CWT.
- One-dimensional discrete signal protocol.
- Source modules: sine, square, triangle, Gaussian pulse, pulse, chirp, white noise, constant, and inline import array.
- Operation modules: add, subtract, multiply, scale, delay, convolution, cross-correlation, and normalization.
- Analysis modules: FFT spectrum, STFT, and CWT.
- Three-column workstation UI with module library, node canvas, timeline, parameter inspector, and time/frequency charts.
- Analysis backend status indicator for SciPy-powered modules.
- Project JSON, signal CSV, NumPy `.npy`, analysis CSV/JSON, and Python reproduction script exports.
- STFT/CWT exports support both long-form CSV (`frequency,time,power`) and matrix CSV (`frequency\time` table).

## Run

For the full web experience, including STFT/CWT:

```powershell
pnpm install
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
pnpm web:full
```

You can also run the two processes separately:

```powershell
pnpm backend:dev
pnpm dev
```

The web workspace talks to the local analysis service at `http://127.0.0.1:8765`. Tauri desktop packaging remains available in `src-tauri/tauri.conf.json`; a Rust toolchain is required before running Tauri build commands.

The top bar shows the local analysis backend state. If it is offline, STFT/CWT nodes will show an actionable message and the web UI can keep running while you start `pnpm backend:dev`.

# SignalForge MVP

SignalForge is a local scientific workstation for building one-dimensional simulated signals with modular sources, operation nodes, timeline alignment, live previews, and reproducible exports.

## Current MVP

- Tauri-oriented project structure with a React + TypeScript + Vite frontend.
- One-dimensional discrete signal protocol.
- Source modules: sine, cosine, square, pulse, chirp, white noise, constant, and inline import array.
- Operation modules: add, subtract, multiply, scale, delay, convolution, cross-correlation, FFT spectrum, and normalization.
- Three-column workstation UI with module library, node canvas, timeline, parameter inspector, and time/frequency charts.
- Project JSON, CSV, NumPy `.npy`, and Python reproduction script exports.

## Run

```powershell
pnpm install
pnpm dev
```

Tauri desktop packaging is scaffolded in `src-tauri/tauri.conf.json`. A Rust toolchain is required before running Tauri build commands.

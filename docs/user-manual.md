# SignalForge User Manual

SignalForge is a local scientific workbench for building, combining, analyzing, and exporting one-dimensional discrete signals. It is designed for fast simulation experiments: drag modules onto the canvas, connect them into an acyclic signal graph, inspect every intermediate output, and export reproducible results.

## Workspace Overview

The app uses a three-column workstation layout.

- **Top bar**: global project controls and sampling settings.
- **Module Library**: signal sources, operations, analysis modules, and custom modules.
- **Node Canvas**: the main graph editor where modules are placed and connected.
- **Master Timeline**: global time-window control and display range selection.
- **Chart Panel**: time-domain, spectrum, and analysis visualizations.
- **Inspector**: parameters, run summary, provenance, analysis results, and selected-node exports.

## Top Bar

The top bar contains project-level actions.

- **Sample Rate**: global sampling rate in Hz. Source nodes follow this global rate during evaluation.
- **Samples / Duration**: global sample count and time duration. Changing one updates the global project scale.
- **Import CSV**: imports a CSV file as a new source node.
- **Project**: loads a saved SignalForge project JSON.
- **Save**: exports the full project JSON, including nodes, parameters, edges, display target, disabled nodes, and external command settings.
- **Reproduce.py**: exports `signalforge-reproduce.py`, a Python script that reconstructs the current node graph as far as possible.

`Reproduce.py` means **export a reproduction script**. It does not run Python and does not start the backend.

## Module Library

The left panel contains draggable modules. Click a module to add it quickly, or drag it onto the canvas.

The search box filters modules by label, description, kind, and category. A floating button appears after scrolling and returns the library to the top.

### Signal Sources

- **Sine**: sinusoidal waveform with frequency, amplitude, and phase.
- **Triangle**: bipolar triangle wave.
- **Square**: bipolar square wave.
- **Pulse**: rectangular pulse with start, width, and amplitude.
- **Gaussian Pulse**: Gaussian pulse with center, sigma, and amplitude.
- **Chirp**: linear frequency sweep.
- **White Noise**: seeded uniform white noise.
- **Photon Counts**: coherent Poisson or thermal chaotic photon-count simulation with detector efficiency, dark counts, coherence time, and optional modulation.
- **Constant**: constant baseline.
- **Import Array**: inline numeric values.

### Operations

- **Add / Subtract / Multiply**: element-wise arithmetic.
- **Scale**: scalar gain.
- **Delay**: prepends zero samples.
- **Convolve**: full discrete convolution.
- **Cross Correlate**: full cross-correlation.
- **Normalize**: scales by maximum absolute value.
- **Custom Expression**: multi-input expression module using `x0`, `x1`, `x2...`.
- **External Command**: runs a packaged executable module through the desktop shell protocol.

### Analysis

- **FFT Spectrum**: frequency magnitude spectrum.
- **RMS**: root mean square.
- **Quantiles**: mean, min, max, and selected percentile.
- **Distribution**: histogram counts and density.
- **SNR**: signal-to-noise ratio against a noise floor.
- **Dominant Frequency**: strongest non-DC frequency.
- **Bandwidth**: occupied bandwidth above a threshold.
- **G2 Correlation**: normalized or raw second-order auto/cross-correlation, either at one lag or as a curve over delay.
- **STFT / CWT**: time-frequency analysis through the local Python/SciPy backend.

### Custom

- **Custom Source**: expression-based source using `t`, `n`, `sampleRate`, `p0`, `p1`, `p2`, and math functions.
- **Custom Expression**: expression-based operation using connected input variables `x0`, `x1`, `x2...`.
- **External Command**: external executable integration.

## Node Canvas

The canvas is the main graph editor.

- Click a node to select it.
- Shift-click nodes for multi-select.
- Shift-drag on empty canvas for box selection.
- Drag selected nodes to move them together.
- Connect an output port to an input port to create a directed edge.
- Invalid connections are rejected: self-connections, cycles, duplicate edges, or too many inputs.
- Open the node menu with either the three-dot button or right-click. Both provide the same local actions: set/clear display target, rename, enable/disable, duplicate, delete, and start connection.
- Use the canvas toolbar for zoom, fit view, automatic layout, undo/redo, grouping, duplication, deletion, and clearing the canvas.
- **Auto Layout** creates a compact horizontal signal-flow arrangement, keeps explicit groups together, prevents node overlap, and finishes by fitting the graph into view.

The graph is constrained to a directed acyclic graph. This keeps evaluation order deterministic and reproducible.

### Advanced Canvas

Use **Open Advanced Canvas** in the canvas toolbar to expand the graph editor to the full window. The same node graph and editing state are reused; entering this mode does not create a second canvas.

- Drag on empty space to box-select nodes.
- Drag any selected node to move the whole node selection.
- Group selected nodes or groups with the toolbar or `Ctrl/Cmd + G`.
- Click a group background or header to select and drag the complete group.
- Groups can be nested. `Ctrl/Cmd + Shift + G` removes the selected group level while preserving nested child groups.
- Right-click a group to open group results, rename, duplicate, ungroup, or delete it.
- A simple node click opens the floating Inspector beside that node.
- Dragging a node does not open the Inspector. If it is already open, starting a drag hides it.
- Inspector, Results, and Group Results are movable floating panels. Results panels can also be maximized.

### Canvas Shortcuts

- `Ctrl/Cmd + Z`: undo.
- `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y`: redo.
- `Delete` / `Backspace`: delete selected nodes or edge.
- `Ctrl/Cmd + D`: duplicate selected nodes.
- `Ctrl/Cmd + A`: select all nodes in Advanced Canvas.
- `Ctrl/Cmd + G`: group the current selection.
- `Ctrl/Cmd + Shift + G`: ungroup the selected group level.
- `Esc`: cancel connection or temporary UI state.

When the cursor is inside an input, textarea, select box, or editable text area, these canvas shortcuts are isolated so normal typing and deletion work safely.

## Master Timeline

The Master Timeline controls the visible time region used by the chart panel.

- Drag the playhead to inspect values at a specific time.
- Drag IN and OUT handles to change the selected display window.
- Drag the selected region to move the window.
- Use `Shift + scroll` to zoom the time window.
- Use **Fit Full** to reset the view to the full project duration.
- Use **To Start** / **To End** to move the playhead.

The time-domain chart follows the timeline selection, so zooming and panning the timeline changes the chart display without changing exported raw data.

## Chart Panel

The chart panel has mode tabs.

- **Time**: time-domain signal display.
- **Spectrum**: frequency-domain display.
- **Analysis**: scalar, summary, distribution, or time-frequency result display.

### Time View

- Shows the current display target signal.
- Can overlay comparison signals from selected nodes.
- Shows a cursor readout for the current sample.
- Supports Y-axis pan and zoom.
- **Auto Scale Y** restores automatic vertical scaling.
- Preview point count controls visual downsampling only; exports keep raw values.

### Spectrum View

- Shows FFT spectrum data.
- Supports linear and dB magnitude modes.
- Displays peak frequency information.

### Analysis View

Analysis modules can return scalars, summaries, distributions, spectra, or time-frequency matrices. STFT and CWT require the local analysis backend or desktop shell backend.

## Inspector

The right panel edits the selected node in the standard workspace. In Advanced Canvas, a simple node click opens the same Inspector as a movable panel beside the node; dragging only moves the node and does not open it.

### Parameters

Each module exposes its own parameter schema. Editing a parameter updates the graph and refreshes previews.

For source nodes:

- **Start Time** controls the source timeline offset.
- **Duration** controls source length under the global sampling rate.

For **Custom Expression**, the Inspector also shows **Input Variables**:

```text
x0  First connected signal
x1  Second connected signal
x2  Third connected signal
```

Use these variables in expressions, for example:

```text
x0 * x1 + p0 * sin(2*pi*p1*t)
```

Supported expression symbols include `t`, `n`, `sampleRate`, `p0`, `p1`, `p2`, `sin`, `cos`, `exp`, `sqrt`, `abs`, `min`, `max`, and related math functions.

### Collapsible Sections

- **Run Summary**: module type, output type, input list, parameter summary, status.
- **Analysis Results**: visible when the node produces analysis output.
- **Provenance**: default collapsed. Shows backend, input node IDs, sample count, warnings, and metadata.
- **Selected Node Output**: exports the selected node output, not the whole project.

## Backend Status

The backend status chip shows the local analysis backend state and active runs.

- **Backend Online**: local analysis backend is reachable.
- **Backend Offline**: STFT/CWT in the web UI needs `pnpm backend:dev` or `pnpm web:full`.
- **Running N**: backend or external command jobs are running.

External executable modules require the Tauri desktop shell. Browser-only sessions cannot directly launch arbitrary executables.

## Import And Export

### CSV Import

SignalForge supports two CSV forms.

One column:

```csv
value
1
2
-3
```

This is imported as `value-only` data using the current fallback sample rate.

Two columns:

```csv
t,value
0.000,1
0.001,0
0.002,-1
```

This is imported as `time,value` data. The sample rate is inferred from the median positive time step.

CSV comment lines beginning with `#` are ignored, so exported SignalForge CSV files can be re-imported.

### Project JSON

Project JSON saves the node graph, edges, parameters, global sampling settings, display target, disabled nodes, and metadata. External Command nodes keep their `executablePath`, `arguments`, `timeoutMs`, and numeric parameters.

### Node CSV

Exports the selected node signal as:

```csv
# SignalForge signal export
# node=...
# sampleRate=...
# unit=...
# params=...
# backend=...
# inputNodeIds=...
# provenanceParams=...
# warnings=...
time,value
...
```

### Node NPY

Exports the selected node signal values as a NumPy Float64 `.npy` vector.

### Analysis CSV / JSON

Analysis outputs can be exported as CSV or JSON. STFT/CWT can export long-form CSV or matrix CSV.

### Reproduce.py

Exports a Python script that reconstructs sources and core operations. It includes:

- source generation,
- arithmetic operations,
- custom expressions,
- analysis placeholders where needed,
- an External Command protocol stub.

External Command nodes in the script call the configured executable with `request.json` and `result.json`.

## External Command Protocol

External Command nodes let SignalForge run a packaged executable module. This can be a Python-built executable, C++ program, Rust binary, MATLAB-compiled program, Julia app, or any command-line tool that follows the protocol.

### Node Parameters

- **Executable Path**: path to the executable file.
- **Arguments**: command argument template. Default:

```text
--input {input} --output {output}
```

- **Timeout**: maximum run time in milliseconds.
- **p0 / p1 / p2**: numeric parameters passed through `params`.

SignalForge replaces:

- `{input}` with the generated request JSON path.
- `{output}` with the expected result JSON path.

### Request JSON

SignalForge writes `request.json` before launching the executable.

```json
{
  "nodeId": "externalCommand-1",
  "name": "External Command",
  "executablePath": "H:/tools/my_module.exe",
  "arguments": "--input {input} --output {output}",
  "timeoutMs": 30000,
  "sampleRate": 1000,
  "params": {
    "p0": 2,
    "p1": 0,
    "p2": 0
  },
  "inputs": [
    {
      "id": "source-a",
      "name": "Sine A",
      "sampleRate": 1000,
      "unit": "a.u.",
      "time": [0, 0.001, 0.002],
      "values": [0, 0.5, 1.0]
    }
  ]
}
```

### Result JSON

The executable must create `result.json`.

```json
{
  "type": "signal",
  "values": [0, 1, 2, 3],
  "unit": "a.u.",
  "warnings": ["optional warning"],
  "metadata": {
    "module": "demo-filter",
    "version": "1.0.0"
  }
}
```

Currently the executable result must be `type: "signal"` with at least one numeric value. Analysis result support can be added later.

### Minimal Python Example

Save this as `external_gain.py`:

```python
import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()

request = json.loads(open(args.input, "r", encoding="utf-8").read())
gain = request.get("params", {}).get("p0", 1)
values = request["inputs"][0]["values"]

result = {
    "type": "signal",
    "values": [gain * value for value in values],
    "unit": request["inputs"][0].get("unit", "a.u."),
    "warnings": [],
    "metadata": {
        "module": "external_gain.py"
    }
}

open(args.output, "w", encoding="utf-8").write(json.dumps(result, indent=2))
```

During development, wrap it with a small `.cmd` file or package it as an executable. For example:

```bat
@echo off
python H:\tools\external_gain.py %*
```

Then configure:

```text
Executable Path: H:\tools\external_gain.cmd
Arguments: --input {input} --output {output}
p0: 2
```

### Error Handling

SignalForge reports these errors in the node status:

- executable path is empty,
- executable does not exist,
- command timeout,
- non-zero exit code,
- missing `result.json`,
- invalid result JSON,
- unsupported result type,
- empty signal result.

Warnings and metadata returned by the external module are stored in provenance and included in exports.

## Reproducibility Notes

For trustworthy experiments:

- Keep project JSON files with your exported datasets.
- Use explicit seeds for random sources.
- Record external module versions in `metadata`.
- Prefer relative or documented external paths when sharing projects.
- Export node-level CSV/NPY for the actual module you want to analyze.
- Use `Reproduce.py` as a companion script, not as a replacement for the saved project JSON.

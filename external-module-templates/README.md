# SignalForge External Module Templates

This folder contains starter templates for External Command modules. These files are not part of the app build. They are examples you can copy, edit, package, and point to from an External Command node.

## Runtime Protocol

SignalForge launches an external module as a command-line program. The default argument template is:

```text
--input {input} --output {output}
```

Before launch, SignalForge replaces:

- `{input}` with the path to a generated `request.json`.
- `{output}` with the path where the module must write `result.json`.

The executable must exit with status code `0` and create the output JSON file.

## Request Shape

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

## Result Shape

Current External Command nodes accept signal results:

```json
{
  "type": "signal",
  "values": [0, 1, 2, 3],
  "unit": "a.u.",
  "warnings": [],
  "metadata": {
    "module": "demo",
    "version": "1.0.0"
  }
}
```

`values` must contain at least one finite number. `unit`, `warnings`, and `metadata` are optional.

## Templates

- `python/signal_module.py`: Python template using only the standard library.
- `julia/signal_module.jl`: Julia template using `JSON3.jl`.

Both templates implement the same simple operation: multiply the first input signal by `params.p0`.


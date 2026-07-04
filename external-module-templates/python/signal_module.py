import argparse
import json
import math
from pathlib import Path


MODULE_NAME = "python-gain-template"
MODULE_VERSION = "1.0.0"


def finite_number(value, fallback=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if math.isfinite(number) else fallback


def compute(request):
    inputs = request.get("inputs", [])
    if not inputs:
        raise ValueError("At least one input signal is required.")

    source = inputs[0]
    values = source.get("values", [])
    if not values:
        raise ValueError("The first input signal has no values.")

    params = request.get("params", {})
    gain = finite_number(params.get("p0", 1.0), 1.0)
    output_values = [gain * finite_number(value) for value in values]

    return {
        "type": "signal",
        "values": output_values,
        "unit": source.get("unit", "a.u."),
        "warnings": [],
        "metadata": {
            "module": MODULE_NAME,
            "version": MODULE_VERSION,
            "operation": "output = p0 * input_0",
            "gain": gain,
            "inputId": source.get("id"),
            "sampleRate": source.get("sampleRate", request.get("sampleRate"))
        }
    }


def main():
    parser = argparse.ArgumentParser(description="SignalForge Python external module template.")
    parser.add_argument("--input", required=True, help="Path to SignalForge request.json.")
    parser.add_argument("--output", required=True, help="Path where result.json must be written.")
    args = parser.parse_args()

    request = json.loads(Path(args.input).read_text(encoding="utf-8"))
    result = compute(request)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()


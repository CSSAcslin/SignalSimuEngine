import json
import sys


def _require_scipy():
    try:
        import numpy as np
        from scipy import signal
    except Exception as exc:
        raise RuntimeError(f"Python/SciPy backend unavailable: {exc}") from exc
    return np, signal


def _as_int(params, key, default, minimum):
    value = int(params.get(key, default))
    return max(minimum, value)


def run_stft(np, signal, values, sample_rate, params):
    window_size = _as_int(params, "windowSize", 128, 8)
    hop_size = _as_int(params, "hopSize", max(1, window_size // 4), 1)
    noverlap = max(0, window_size - hop_size)
    frequency, time, zxx = signal.stft(
        values,
        fs=sample_rate,
        nperseg=min(window_size, len(values)),
        noverlap=min(noverlap, max(0, min(window_size, len(values)) - 1)),
        boundary=None,
        padded=False,
    )
    return time, frequency, np.abs(zxx) ** 2


def run_cwt(np, signal, values, sample_rate, params):
    voices = _as_int(params, "voicesPerOctave", 12, 1)
    max_width = max(2, min(len(values), voices * 4))
    widths = np.arange(1, max_width + 1)
    if hasattr(signal, "cwt") and hasattr(signal, "morlet2"):
        matrix = signal.cwt(values, signal.morlet2, widths, w=5.0)
    else:
        matrix = []
        for width in widths:
            support = int(max(8, width * 8))
            t = np.linspace(-4, 4, support)
            wavelet = np.exp(1j * 5.0 * t) * np.exp(-0.5 * t * t)
            wavelet = wavelet / np.sqrt(max(width, 1))
            convolved = np.convolve(values, np.conj(wavelet[::-1]), mode="same")
            if convolved.size != values.size:
                start = max(0, (convolved.size - values.size) // 2)
                convolved = convolved[start : start + values.size]
            matrix.append(convolved)
        matrix = np.asarray(matrix)
    time = np.arange(len(values)) / sample_rate
    frequency = sample_rate / np.maximum(widths, 1)
    return time, frequency, np.abs(matrix) ** 2


def main():
    request = json.loads(sys.stdin.read())
    np, signal = _require_scipy()
    values = np.asarray(request.get("values", []), dtype=float)
    if values.size == 0:
        raise RuntimeError("Time-frequency backend received an empty signal.")
    sample_rate = float(request.get("sampleRate", 1))
    params = request.get("params", {})
    method = request.get("method", "STFT").upper()
    if method == "STFT":
        time, frequency, power = run_stft(np, signal, values, sample_rate, params)
    elif method == "CWT":
        time, frequency, power = run_cwt(np, signal, values, sample_rate, params)
    else:
        raise RuntimeError(f"Unsupported time-frequency method: {method}")

    print(
        json.dumps(
            {
                "time": time.tolist(),
                "frequency": frequency.tolist(),
                "power": power.tolist(),
                "unit": "power",
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Local Whisper worker for scripts/transcribe-local.mjs (faster-whisper).

Prints raw word-level JSON to stdout; progress goes to stderr. The Node
wrapper normalizes the result into the kit's transcript format, so call that
wrapper instead of running this file directly.

  python whisper-local.py <audio> [--model small.en] [--language en]
                          [--device cpu] [--compute-type int8] [--beam-size 5]
                          [--vad] [--download-only]
"""

import argparse
import json
import sys


def load_audio(path):
    """Read the wrapper's 16 kHz mono 16-bit WAV without PyAV.

    faster-whisper's own decoder depends on PyAV, whose newer releases break
    its API; ffmpeg already produced exactly the format Whisper expects.
    """
    import wave
    import numpy as np

    with wave.open(path, "rb") as w:
        if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (16000, 1, 2):
            sys.exit("expected 16 kHz mono 16-bit WAV; use scripts/transcribe-local.mjs")
        pcm = w.readframes(w.getnframes())
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio", nargs="?")
    p.add_argument("--model", default="small.en")
    p.add_argument("--language", default="en")
    p.add_argument("--device", default="auto")
    p.add_argument("--compute-type", default="default")
    p.add_argument("--beam-size", type=int, default=5)
    p.add_argument("--vad", action="store_true")
    p.add_argument("--download-only", action="store_true")
    a = p.parse_args()

    from faster_whisper import WhisperModel

    compute = a.compute_type
    if compute == "default":
        compute = "int8" if a.device in ("auto", "cpu") else "float16"
    print(f"loading model {a.model} ({a.device}, {compute})", file=sys.stderr, flush=True)
    model = WhisperModel(a.model, device=a.device, compute_type=compute)
    if a.download_only:
        print(f"model {a.model} ready", file=sys.stderr)
        return
    if not a.audio:
        p.error("audio path required")

    segments, info = model.transcribe(
        load_audio(a.audio),
        language=a.language or None,
        beam_size=a.beam_size,
        word_timestamps=True,
        vad_filter=a.vad,
        condition_on_previous_text=False,
    )
    out = {"language": info.language, "duration": info.duration, "segments": []}
    for seg in segments:
        print(f"  {seg.end:7.1f}s / {info.duration:.1f}s", file=sys.stderr, flush=True)
        out["segments"].append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text,
            "words": [
                {"word": w.word, "start": w.start, "end": w.end, "probability": w.probability}
                for w in (seg.words or [])
            ],
        })
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()

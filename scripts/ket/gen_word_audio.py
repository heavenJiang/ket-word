"""Record the words Word Atlas has no pronunciation for (two, the, bus stop, Dr…) with Higgs Audio.

Without a recording the app fell back to the browser's voice, which on an iPad stays silent unless the
child has just tapped (the first meeting plays each word by itself) and sounds poor when it does speak.
Each word is recorded in the narrator's voice (the example sentences' voice), best of up to MAX_TRIES
takes judged by Whisper, into content/media/word/<id>.mp3; build_app_data.py uses it for both accents
of a word that has no Word Atlas recording. Abbreviations are read as said (Dr → doctor, CD → C D).

Usage (takes the audio lease on the GPU box):
    python3 ~/.claude/tools/gpu-box/gpu_box.py run --kind audio -- \\
      uv run --no-project --python 3.12 --with faster-whisper --with numpy --with "av<14" python scripts/ket/gen_word_audio.py [--only two,the]
Words already recorded are skipped; --redo records the listed ones again.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path

import gen_audio as ga

ROOT = ga.ROOT
APP = ROOT / "public/data/topics"
OUT = ROOT / "content/media/word"
SPEAKER = "narrator"

# how an abbreviation is said; the recording is checked against what is said
SPOKEN = {"CD": "C D", "DVD": "D V D", "ID": "I D", "Dr": "doctor", "Mr": "mister", "Mrs": "missus", "Ms": "miz", "OK": "okay"}


def spoken(word: str) -> str:
    """The word as said: abbreviations spelled out, a closing ! or ? kept for the voice's tone."""
    return " ".join(SPOKEN.get(part, part) for part in word.split())


def missing() -> dict[str, str]:
    """Words (first meanings) the app has no recording for: id → written word."""
    out: dict[str, str] = {}
    for p in sorted(APP.glob("*.json")):
        for w in json.loads(p.read_text(encoding="utf-8"))["words"]:
            # no Word Atlas recording: none at all, or only our own (when re-recording)
            if not w.get("of") and not str(w["media"].get("uk", "media/word/")).startswith("media/word/"):
                continue
            if not w.get("of"):
                out[w["id"]] = w["word"]
    return out


def record(text: str, dest: Path) -> tuple[float, str, int]:
    """Best take by Whisper's character error rate, as mp3; returns its error rate, what was heard, tries."""
    with tempfile.TemporaryDirectory() as tmp:
        best: tuple[float, str, int, Path] | None = None
        for k in range(ga.MAX_TRIES):
            wav = Path(tmp) / f"{k}.wav"
            ga.synth(text, SPEAKER, 42 + k * 1000, wav)
            heard = ga.transcribe(wav)
            c = ga.cer(text, heard)
            if best is None or c < best[0]:
                best = (c, heard, k + 1, wav)
            if c <= ga.GOOD_CER:
                break
        assert best
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(best[3]), "-ac", "1", "-b:a", "48k", str(dest)], check=True)
        return best[0], best[1], best[2]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated word ids")
    ap.add_argument("--redo", default="", help="comma-separated word ids to record again")
    a = ap.parse_args()
    only = {x for x in a.only.split(",") if x}
    redo = {x for x in a.redo.split(",") if x}
    OUT.mkdir(parents=True, exist_ok=True)
    todo = {i: w for i, w in missing().items() if (not only or i in only) and (i in redo or not (OUT / f"{i}.mp3").exists())}
    print(f"{len(todo)} words to record at {ga.URL}", flush=True)
    for n, (wid, word) in enumerate(todo.items(), 1):
        t = time.time()
        c, heard, tries = record(spoken(word), OUT / f"{wid}.mp3")
        flag = "" if c <= ga.GOOD_CER else f"  ⚠ heard: {heard}"
        print(f"  [{n}/{len(todo)}] cer={c:.2f} tries={tries} ({time.time() - t:.0f}s) {word}{flag}", flush=True)


if __name__ == "__main__":
    main()

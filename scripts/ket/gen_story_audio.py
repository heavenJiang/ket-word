"""Record every story page with Higgs Audio, with word timings for the read-along highlight.

Stories used to be read by the browser's own voice, which on many tablets is robotic or not English
at all. Each page is now recorded sentence by sentence in the narrator's voice (best of up to
MAX_TRIES takes, judged by Whisper, as for example sentences), joined with short pauses, and timed
word by word with Whisper so the reader can light up each word as it is said.

content/audio/stories.json maps each page's text to its file and marks: [character index in the
page text, second in the recording] for every word. Pages already recorded and unchanged are skipped.

Usage (takes the audio lease on the GPU box):
    python3 ~/.claude/tools/gpu-box/gpu_box.py run --kind audio -- \\
      uv run --no-project --python 3.12 --with faster-whisper --with numpy --with "av<14" python scripts/ket/gen_story_audio.py [--only zoo-day]
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path

import gen_audio as ga

ROOT = ga.ROOT
STORIES = ROOT / "content/stories"
OUT = ROOT / "public/media/story"
MANIFEST = ga.AUDIO / "stories.json"
SPEAKER = "narrator"
PAUSE = 0.35  # seconds between sentences
WORD = re.compile(r"[A-Za-z0-9']+")


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]


def best_take(text: str, tmp: Path, n: int) -> tuple[Path, float]:
    """The take Whisper hears best, as a wav, and its character error rate."""
    best: tuple[Path, float] | None = None
    for k in range(ga.MAX_TRIES):
        wav = tmp / f"{n}-{k}.wav"
        ga.synth(text, SPEAKER, 42 + k * 1000, wav)
        c = ga.cer(text, ga.transcribe(wav))
        if best is None or c < best[1]:
            best = (wav, c)
        if c <= ga.GOOD_CER:
            break
    return best  # type: ignore[return-value]


def join(wavs: list[Path], dest: Path) -> None:
    """Sentences one after another with a short pause, as one mono wav."""
    inputs = []
    for w in wavs:
        inputs += ["-i", str(w)]
    parts = "".join(f"[{i}:a]aresample=24000,aformat=channel_layouts=mono,apad=pad_dur={PAUSE}[a{i}];" for i in range(len(wavs)))
    cat = "".join(f"[a{i}]" for i in range(len(wavs))) + f"concat=n={len(wavs)}:v=0:a=1[out]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", parts + cat, "-map", "[out]", str(dest)], check=True)


def marks(text: str, wav: Path) -> list[list[float]]:
    """[character index, start second] for each word of the text, from Whisper's word timestamps.
    Words Whisper heard differently are matched in order; any left over get a time between neighbours."""
    ga.transcribe(wav)  # loads the model
    segs, _ = ga._whisper.transcribe(str(wav), language="en", beam_size=5, word_timestamps=True)
    heard = [(re.sub(r"[^a-z0-9']", "", w.word.lower()), w.start) for s in segs for w in s.words]
    ours = [(m.start(), m.group(0).lower()) for m in WORD.finditer(text)]
    times: list[float | None] = [None] * len(ours)
    sm = difflib.SequenceMatcher(a=[w for _, w in ours], b=[w for w, _ in heard], autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            times[a + k] = heard[b + k][1]
    # fill gaps: between the known times on either side
    for i, t in enumerate(times):
        if t is None:
            prev = next((times[j] for j in range(i - 1, -1, -1) if times[j] is not None), 0.0)
            after = next((times[j] for j in range(i + 1, len(times)) if times[j] is not None), prev)
            times[i] = prev + (after - prev) / 2
    return [[c, round(t, 2)] for (c, _), t in zip(ours, times)]


def name(text: str) -> str:
    key = json.dumps([text, ga.VOICES[SPEAKER], ga.SETTINGS, PAUSE], sort_keys=True)
    return hashlib.sha1(key.encode()).hexdigest()[:12] + ".mp3"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated story ids")
    a = ap.parse_args()
    only = {x for x in a.only.split(",") if x}
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    pages = [pg["en"] for p in sorted(STORIES.glob("*.json")) if not only or p.stem in only for pg in json.loads(p.read_text(encoding="utf-8"))["pages"]]
    todo = [t for t in dict.fromkeys(pages) if not (t in manifest and manifest[t]["file"] == name(t) and (OUT / name(t)).exists())]
    print(f"{len(todo)} story pages to record at {ga.URL}", flush=True)
    for i, text in enumerate(todo, 1):
        t0 = time.time()
        with tempfile.TemporaryDirectory() as tmp:
            takes = [best_take(s, Path(tmp), n) for n, s in enumerate(sentences(text))]
            page = Path(tmp) / "page.wav"
            join([w for w, _ in takes], page)
            dest = OUT / name(text)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(page), "-ac", "1", "-b:a", "48k", str(dest)], check=True)
            worst = max(c for _, c in takes)
            manifest[text] = {"file": dest.name, "marks": marks(text, page), "cer": round(worst, 3)}
        MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        flag = "" if worst <= ga.GOOD_CER else f"  ⚠ worst sentence cer {worst:.2f}"
        print(f"  [{i}/{len(todo)}] ({time.time() - t0:.0f}s) {text[:60]}{flag}", flush=True)
    used = {r["file"] for r in manifest.values()}
    for f in OUT.glob("*.mp3"):  # drop recordings of pages that were edited or removed
        if f.name not in used:
            f.unlink()


if __name__ == "__main__":
    main()

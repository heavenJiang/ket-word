"""Record every example sentence with ChatTTS, checked by Whisper, into public/media/sent/.

Usage:
    python3 scripts/ket/gen_audio.py [--only animals,food] [--limit 20]

Settings come from a listening test (see README): speed 1, temperature 0.3, top_p 0.7, top_k 20, refine
skipped, and " [uv_break]" after the text, which stops ChatTTS swallowing the last word. Who speaks each
sentence is in content/audio/speakers.json (narrator unless listed); each speaker has a fixed voice.
Every take is transcribed by Whisper; a take that misses words is redone with another text seed, and
the best of up to MAX_TRIES is kept. content/audio/sentences.json records each sentence's file, voice
and score; existing files are reused, so runs resume and only new or edited sentences are recorded.

Env: CHATTTS_URL (default: the generation box on the LAN), WHISPER_MODEL (a faster-whisper model folder).
Needs: pip install faster-whisper numpy; ffmpeg on PATH.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content/topics"
AUDIO = ROOT / "content/audio"
OUT = ROOT / "public/media/sent"
URL = os.environ.get("CHATTTS_URL", "http://192.168.31.128:9966").rstrip("/")

VOICES = {
    "narrator": {"voice": "1111.csv", "custom_voice": 0},  # warm female voice, chosen by ear
    "adult": {"voice": "8888.csv", "custom_voice": 0},  # male voice: a parent talking to a child
    "kid": {"voice": "1111.csv", "custom_voice": 2300},  # voice seed 2300: the most child-like of the accurate high voices
}
SETTINGS = dict(prompt="", speed=1, temperature=0.3, top_p=0.7, top_k=20, refine_max_new_token=384,
                infer_max_new_token=2048, skip_refine=1, is_stream=0)
ENDING = " [uv_break]"
MAX_TRIES = 5
GOOD_CER = 0.03

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def spell(n: int) -> str:
    """0-100 in words, as the sentences write them ("a hundred" for 100)."""
    if n < 20:
        return ONES[n]
    if n == 100:
        return "a hundred"
    return TENS[n // 10] + ("" if n % 10 == 0 else ONES[n % 10])


# Whisper writes American spelling; compare the British forms the content uses
US_UK = {"mom": "mum", "moms": "mums", "color": "colour", "colors": "colours", "favorite": "favourite", "gray": "grey",
         "neighbor": "neighbour", "neighbors": "neighbours", "theater": "theatre", "center": "centre", "yogurt": "yogurt",
         "chili": "chilli", "chilis": "chillies", "chilies": "chillies", "granddad": "grandad", "granddads": "grandads", "jewelry": "jewellery", "gonna": "goingto", "genes": "jeans", "omelet": "omelette", "cookie": "biscuit"}


def letters(s: str) -> str:
    """Letters only, numbers spelled out, so "pen friend" = "penfriend" and "12" = "twelve"."""
    s = re.sub(r"[a-z]+", lambda m: US_UK.get(m.group(0), m.group(0)), s.lower())
    s = re.sub(r"\b(\d{1,3})\b", lambda m: spell(int(m.group(1))) if int(m.group(1)) <= 100 else m.group(1), s)
    return re.sub(r"[^a-z]", "", s)


def cer(ref: str, hyp: str) -> float:
    a, b = letters(ref), letters(hyp)
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return d[len(b)] / max(1, len(a))


_whisper = None


def transcribe(wav: Path) -> str:
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        _whisper = WhisperModel(os.environ.get("WHISPER_MODEL", "small.en"), device="cpu", compute_type="int8")
    segs, _ = _whisper.transcribe(str(wav), language="en", beam_size=5)
    return " ".join(s.text for s in segs).strip()


def synth(text: str, speaker: str, seed: int, dest: Path) -> None:
    body = urllib.parse.urlencode({**SETTINGS, **VOICES[speaker], "text": text + ENDING, "text_seed": seed}).encode()
    for attempt in range(5):  # the box is on Wi-Fi: ride out short drops
        try:
            with urllib.request.urlopen(urllib.request.Request(URL + "/tts", data=body), timeout=300) as r:
                res = json.loads(r.read())
            if res.get("code") != 0:
                raise RuntimeError(res.get("msg"))
            urllib.request.urlretrieve(res["url"], dest)
            return
        except Exception:
            if attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))


def name(text: str, speaker: str) -> str:
    """File name from the sentence and its voice, so an edited sentence or a new voice gets a new file."""
    key = json.dumps([text, VOICES[speaker], SETTINGS, ENDING], sort_keys=True)
    return hashlib.sha1(key.encode()).hexdigest()[:12] + ".mp3"


def record(text: str, speaker: str) -> dict:
    """Best of up to MAX_TRIES takes, judged by Whisper."""
    best: dict | None = None
    with tempfile.TemporaryDirectory() as tmp:
        for k in range(MAX_TRIES):
            wav = Path(tmp) / f"{k}.wav"
            synth(text, speaker, 42 + k * 1000, wav)
            hyp = transcribe(wav)
            take = {"wav": wav, "hyp": hyp, "cer": cer(text, hyp), "tries": k + 1}
            if best is None or take["cer"] < best["cer"]:
                best = take
            if take["cer"] <= GOOD_CER:
                break
        dest = OUT / name(text, speaker)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(best["wav"]), "-ac", "1", "-b:a", "48k", str(dest)], check=True)
    return {"file": dest.name, "speaker": speaker, "cer": round(best["cer"], 3), "heard": best["hyp"], "tries": best["tries"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated topics")
    ap.add_argument("--limit", type=int, default=0, help="record at most this many new sentences")
    a = ap.parse_args()
    only = {x for x in a.only.split(",") if x}
    speakers = json.loads((AUDIO / "speakers.json").read_text(encoding="utf-8"))["speakers"]
    manifest_path = AUDIO / "sentences.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)

    todo: list[str] = []
    for p in sorted(CONTENT.glob("*.json")):
        if only and p.stem not in only:
            continue
        for w in json.loads(p.read_text(encoding="utf-8"))["words"]:
            for en in [w["en"], *(m[0] for m in w.get("more", []))]:
                speaker = speakers.get(en, "narrator")
                have = manifest.get(en)
                if en not in todo and not (have and have["file"] == name(en, speaker) and (OUT / have["file"]).exists()):
                    todo.append(en)
    if a.limit:
        todo = todo[: a.limit]
    print(f"{len(todo)} sentences to record at {URL}")
    for i, en in enumerate(todo, 1):
        t = time.time()
        rec = record(en, speakers.get(en, "narrator"))
        manifest[en] = rec
        manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        flag = "" if rec["cer"] <= GOOD_CER else f"  ⚠ heard: {rec['heard']}"
        print(f"  [{i}/{len(todo)}] {rec['speaker']:8} cer={rec['cer']:.2f} tries={rec['tries']} ({time.time() - t:.0f}s) {en}{flag}", flush=True)

    used = {r["file"] for r in manifest.values()}
    for f in OUT.glob("*.mp3"):  # drop recordings of sentences that were edited or removed
        if f.name not in used:
            f.unlink()


if __name__ == "__main__":
    main()

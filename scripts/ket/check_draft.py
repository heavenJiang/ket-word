"""Check a draft island in content/drafts/<topic>.json before it moves to content/topics/.

Usage:
    python3 scripts/ket/check_draft.py content/drafts/time.json [--partial]

A draft is written a batch at a time, so --partial skips only the "official words without content"
check; everything else is what build_app_data.py asks of an open island, plus the sentence checks of
check_sentences.py and the scene its picture will be generated from (gen_comfy.py) unless a picture
already exists. Prints one line per problem and exits 1 when there is any.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / "data/ket-words.json"


def load(name: str) -> ModuleType:
    """Import a script from this folder by path: python -I keeps the folder off sys.path."""
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("draft", help="content/drafts/<topic>.json")
    ap.add_argument("--partial", action="store_true",
                    help="the draft is still being written: not every word of the topic needs content yet")
    a = ap.parse_args()
    tid = Path(a.draft).stem  # the island this draft will become
    c = json.loads(Path(a.draft).read_text(encoding="utf-8"))
    items = json.loads(WORDS.read_text(encoding="utf-8"))["items"]

    build_app_data, check_sentences = load("build_app_data"), load("check_sentences")
    problems = build_app_data.content_problems(tid, c, items, partial=a.partial)

    by_id = {i["id"]: i for i in items}
    # ids not on the KET list are reported by the content check; their sentences are not worth reading
    known = [w for w in c["words"] if w.get("of", w["id"]) in by_id]
    unknown, no_gap, _ = check_sentences.check_words(tid, known, check_sentences.vocabulary(), by_id)
    for u in unknown:  # check_words reports "time/afternoon: <sentence>  ← xylophone"; keep the word first
        wid, _, rest = u.removeprefix(f"{tid}/").partition(": ")
        problems.append(f"{wid}: words off the KET list: {rest}")
    for g in no_gap:  # check_words reports "time/afternoon"
        problems.append(f"{g.removeprefix(f'{tid}/')}: no sentence contains the word itself (fill-in-the-gap)")

    for w in c["words"]:  # a picture already picked means no scene is needed; "picture": false keeps the emoji
        if w.get("picture") is False and w.get("scene"):
            problems.append(f"{w['id']}: has \"picture\": false and a scene; keep one")
        if not w.get("scene") and w.get("picture") is not False and not any((d / f"{w['id']}.webp").exists() for d in build_app_data.OWN_IMG):
            problems.append(f"{w['id']}: needs a scene, or a picture in content/media")

    for p in problems:
        print(p)
    if problems:
        raise SystemExit(1)
    print(f"ok: {len(c['words'])} words")


if __name__ == "__main__":
    main()

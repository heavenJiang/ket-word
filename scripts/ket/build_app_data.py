"""Build the web app's data files and fetch reusable Word Atlas media.

Usage:
    python3 scripts/ket/build_app_data.py

Reads:
    data/ket-words.json                 (from build_words.py)
    content/topics/<topic>.json         hand-reviewed kid content, one file per topic
    .local/word-atlas/word-atlas.json   Word Atlas dataset (CC BY 4.0)
Writes:
    public/data/index.json              topic map: every topic with counts and availability
    public/data/topics/<topic>.json     full entries for topics that have kid content
    public/media/{img,uk,us}/<id>.*     Word Atlas illustrations and audio (cached in .local/media)
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / "data/ket-words.json"
CONTENT = ROOT / "content/topics"
ATLAS = ROOT / ".local/word-atlas/word-atlas.json"
OUT = ROOT / "public/data"
MEDIA = ROOT / "public/media"
# Our own illustrations, first match wins: picked AI images (gen_comfy.py / gen_images.py), then
# hand-drawn SVGs rendered by render_svg.mjs, which stay as the fallback.
OWN_IMG = [ROOT / "content/media/ai", ROOT / "content/media/img"]
CACHE = ROOT / ".local/media"
ATLAS_RAW = "https://raw.githubusercontent.com/designfuchen/word-atlas/main/public/atlas"

# Word Atlas path -> our path, per media kind
MEDIA_KINDS = {
    "img": ("img/{id}.webp", "img/{id}.webp"),
    "uk": ("audio/uk/{id}.mp3", "uk/{id}.mp3"),
    "us": ("audio/us/{id}.mp3", "us/{id}.mp3"),
}


def fetch(atlas_id: str, kind: str, our_id: str) -> str | None:
    """Copy one Word Atlas media file into public/media; return its web path."""
    src_tpl, dst_tpl = MEDIA_KINDS[kind]
    cached = CACHE / src_tpl.format(id=atlas_id)
    if not cached.exists():
        cached.parent.mkdir(parents=True, exist_ok=True)
        try:
            with urllib.request.urlopen(f"{ATLAS_RAW}/{src_tpl.format(id=atlas_id)}", timeout=30) as r:
                cached.write_bytes(r.read())
        except Exception as e:  # missing media is fine: the app falls back to emoji / TTS
            print(f"  ! {kind} {atlas_id}: {e}")
            return None
    dst = MEDIA / dst_tpl.format(id=our_id)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists() or dst.stat().st_size != cached.stat().st_size:
        dst.write_bytes(cached.read_bytes())
    return "media/" + dst_tpl.format(id=our_id)


def check_content(tid: str, c: dict, items: list[dict]) -> None:
    """Content must cover the topic's official words exactly, and groups must name real words."""
    ids = [w["id"] for w in c["words"]]
    official = {i["id"] for i in items if tid in i["topics"]}
    by_id = {i["id"]: i for i in items}
    problems = []
    if len(ids) != len(set(ids)):
        problems.append(f"duplicate ids: {sorted({x for x in ids if ids.count(x) > 1})}")
    if missing := official - set(ids):
        problems.append(f"official words without content: {sorted(missing)}")
    if extra := set(ids) - by_id.keys():
        problems.append(f"ids not in the KET list: {sorted(extra)}")
    for g in c.get("confusable", []):
        if bad := set(g) - set(ids):
            problems.append(f"confusable group names unknown ids: {sorted(bad)}")
    for w in c["words"]:
        if w.get("atlasImage") is False and not w.get("scene"):
            problems.append(f"{w['id']}: blocked Word Atlas image needs a scene to generate a replacement")
        for k in ("zh", "chunks", "emoji", "en", "sz"):
            if not w.get(k):
                problems.append(f"{w['id']}: missing {k}")
        word = by_id.get(w["id"], {}).get("word", "")
        if "".join(w["chunks"]).lower() != word.lower().replace(" ", "").replace("-", ""):
            problems.append(f"{w['id']}: chunks {w['chunks']} do not spell the word")
    if problems:
        raise SystemExit(f"{tid}: " + "; ".join(problems))


def main() -> None:
    words = json.loads(WORDS.read_text(encoding="utf-8"))
    atlas = {a["id"]: a for a in json.loads(ATLAS.read_text(encoding="utf-8"))}
    items = {i["id"]: i for i in words["items"]}
    content = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(CONTENT.glob("*.json"))}

    (OUT / "topics").mkdir(parents=True, exist_ok=True)
    used_media: set[str] = set()
    topics_out = []
    for t in words["topics"]:
        ids = [i["id"] for i in words["items"] if t["id"] in i["topics"]]
        topics_out.append({**t, "count": len(ids), "ready": t["id"] in content})

    for tid, c in content.items():
        check_content(tid, c, words["items"])
        avoid: dict[str, set[str]] = {}
        for group in c.get("confusable", []):
            for wid in group:
                avoid.setdefault(wid, set()).update(x for x in group if x != wid)
        entries = []
        for w in c["words"]:
            it = items[w["id"]]
            a = atlas.get(it["atlas"] or "")
            media = {}
            own = next((d / f"{w['id']}.webp" for d in OWN_IMG if (d / f"{w['id']}.webp").exists()), None)
            if own:
                dst = MEDIA / "img" / own.name
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(own.read_bytes())
                media["img"] = f"media/img/{own.name}"
                used_media.add(media["img"])
            if a:
                for kind in MEDIA_KINDS:
                    if kind == "img" and (w.get("atlasImage") is False or "img" in media):
                        continue
                    path = fetch(a["id"], kind, w["id"])
                    if path:
                        media[kind] = path
                        used_media.add(path)
            entries.append({
                "id": w["id"],
                "word": it["word"],
                "zh": w["zh"],
                "pos": it["pos"],
                "ipa": w.get("ipa") or (a["uk"] if a else ""),
                "chunks": w["chunks"],
                "emoji": w["emoji"],
                "sentence": {"en": w["en"], "zh": w["sz"]},
                "media": media,
                "avoid": sorted(avoid.get(w["id"], ())),
            })
        if bare := [e["id"] for e in entries if "img" not in e["media"]]:
            raise SystemExit(f"{tid}: no illustration for {bare}; draw content/media/svg/<id>.svg "
                             "(render_svg.mjs) or generate one (gen_comfy.py / gen_images.py)")
        (OUT / "topics" / f"{tid}.json").write_text(
            json.dumps({"id": tid, "words": entries}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{tid}: {len(entries)} words, {sum(1 for e in entries if 'img' in e['media'])} illustrated")

    # drop media no longer referenced, e.g. an illustration blocked after review
    for f in MEDIA.rglob("*"):
        if f.is_file() and f"media/{f.relative_to(MEDIA)}" not in used_media:
            f.unlink()
            print(f"  - removed {f.relative_to(ROOT)}")

    (OUT / "index.json").write_text(json.dumps({
        "source": words["source"],
        "credits": "Illustrations and recordings: Word Atlas contributors — CC BY 4.0 "
                   "(https://github.com/designfuchen/word-atlas)",
        "topics": topics_out,
    }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()

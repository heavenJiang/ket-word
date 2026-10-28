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

import importlib.util
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


def senses_of(w: dict, it: dict, parent: dict | None = None) -> list[dict]:
    """Meanings as [{pos, zh, en?}]. Content lists them for words with several (can: 罐头 n. / 能 mv.);
    otherwise the word's one Chinese gloss goes with its parts of speech. A second-meaning card puts its
    own meaning first, then the parent word's other meanings."""
    if parent:
        own = {"pos": w["pos"], "zh": w["zh"]}
        return [own] + [s for s in senses_of(parent, it) if s["zh"] != w["zh"]]
    if w.get("senses"):
        return [{"pos": s[0], "zh": s[1], **({"en": s[2]} if len(s) > 2 else {})} for s in w["senses"]]
    return [{"pos": w.get("pos") or it["pos"], "zh": w["zh"]}]


def sentence(en: str, zh: str, recorded: dict, used_media: set[str]) -> dict:
    """An example sentence, with its ChatTTS recording (gen_audio.py) when there is one."""
    out = {"en": en, "zh": zh}
    rec = recorded.get(en)
    if rec and (MEDIA / "sent" / rec["file"]).exists():
        out["audio"] = f"media/sent/{rec['file']}"
        used_media.add(out["audio"])
    return out


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
    # a second-meaning card (can.2, "of": "can") is not on the list itself; its parent word must be here
    cards = {w["id"]: w["of"] for w in c["words"] if w.get("of")}
    if extra := set(ids) - by_id.keys() - cards.keys():
        problems.append(f"ids not in the KET list: {sorted(extra)}")
    if orphans := {k for k, of in cards.items() if of not in ids}:
        problems.append(f"second-meaning cards without their word: {sorted(orphans)}")
    for g in c.get("confusable", []):
        if bad := set(g) - set(ids):
            problems.append(f"confusable group names unknown ids: {sorted(bad)}")
    for w in c["words"]:
        if w.get("atlasImage") is False and not w.get("scene"):
            problems.append(f"{w['id']}: blocked Word Atlas image needs a scene to generate a replacement")
        for k in ("zh", "chunks", "emoji", "en", "sz"):
            if not w.get(k):
                problems.append(f"{w['id']}: missing {k}")
        word = by_id.get(w.get("of", w["id"]), {}).get("word", "")
        if w.get("of") and not w.get("scene"):
            problems.append(f"{w['id']}: a second-meaning card needs its own picture (scene)")
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
    recorded_path = ROOT / "content/audio/sentences.json"
    recorded = json.loads(recorded_path.read_text(encoding="utf-8")) if recorded_path.exists() else {}
    atlas_img = False  # credit Word Atlas for illustrations only while any are still in use
    topics_out = []
    for t in words["topics"]:
        ids = [i["id"] for i in words["items"] if t["id"] in i["topics"]]
        # an open island counts its cards, second meanings included, so progress never reads 108 / 106
        count = len(content[t["id"]]["words"]) if t["id"] in content else len(ids)
        topics_out.append({**t, "count": count, "ready": t["id"] in content})

    for tid, c in content.items():
        check_content(tid, c, words["items"])
        avoid: dict[str, set[str]] = {}
        for group in c.get("confusable", []):
            for wid in group:
                avoid.setdefault(wid, set()).update(x for x in group if x != wid)
        by_word = {w["id"]: w for w in c["words"]}
        for w in c["words"]:  # a word and its second-meaning card look and sound the same
            if w.get("of"):
                avoid.setdefault(w["id"], set()).add(w["of"])
                avoid.setdefault(w["of"], set()).add(w["id"])
        entries = []
        for w in c["words"]:
            it = items[w.get("of", w["id"])]
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
                    if kind == "img" and (w.get("atlasImage") is False or "img" in media or w.get("of")):
                        continue
                    path = fetch(a["id"], kind, w.get("of", w["id"]))  # a second meaning shares its word's recording
                    if path:
                        media[kind] = path
                        atlas_img |= kind == "img"
                        used_media.add(path)
            entries.append({
                "id": w["id"],
                "word": it["word"],
                "zh": w["zh"],
                # the parts of speech this island teaches, from its senses (content can narrow the official list)
                "pos": list(dict.fromkeys(p for sense in senses_of(w, it, by_word.get(w.get("of", ""))) for p in sense["pos"])),
                # meanings with their parts of speech; the first is the one this island teaches and pictures
                "senses": senses_of(w, it, by_word.get(w.get("of", ""))),
                "ipa": w.get("ipa") or (a["uk"] if a else ""),
                "chunks": w["chunks"],
                "emoji": w["emoji"],
                "sentence": {"en": w["en"], "zh": w["sz"]},
                # every example sentence, the main one first; sentence questions draw from these
                "sentences": [sentence(en, zh, recorded, used_media) for en, zh in [(w["en"], w["sz"]), *w.get("more", [])]],
                "media": media,
                **({"of": w["of"], "ofZh": by_word[w["of"]]["zh"]} if w.get("of") else {}),
                "avoid": sorted(avoid.get(w["id"], ())),
            })
        if bare := [e["id"] for e in entries if "img" not in e["media"]]:
            raise SystemExit(f"{tid}: no illustration for {bare}; draw content/media/svg/<id>.svg "
                             "(render_svg.mjs) or generate one (gen_comfy.py / gen_images.py)")
        (OUT / "topics" / f"{tid}.json").write_text(
            json.dumps({"id": tid, "words": entries}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{tid}: {len(entries)} words, {sum(1 for e in entries if 'img' in e['media'])} illustrated")

    # drop word media no longer referenced, e.g. an illustration blocked after review
    # (media/ui holds the app's own pictures, such as the mascot, and is left alone)
    for f in MEDIA.rglob("*"):
        if f.is_file() and f.relative_to(MEDIA).parts[0] != "ui" and f"media/{f.relative_to(MEDIA)}" not in used_media:
            f.unlink()
            print(f"  - removed {f.relative_to(ROOT)}")

    # loaded by path: `npm run data` runs python -I, which keeps this folder off sys.path
    spec = importlib.util.spec_from_file_location("check_sentences", Path(__file__).with_name("check_sentences.py"))
    check_sentences = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(check_sentences)
    unknown, no_gap, total = check_sentences.check(list(content))
    print(f"sentences: {total}, off the KET list: {len(unknown)}, words without a gap sentence: {len(no_gap)}"
          + ("  (run scripts/ket/check_sentences.py)" if unknown or no_gap else ""))

    (OUT / "index.json").write_text(json.dumps({
        "source": words["source"],
        "credits": f"{'Illustrations and recordings' if atlas_img else 'Recordings'}: Word Atlas contributors — "
                   "CC BY 4.0 (https://github.com/designfuchen/word-atlas)",
        "topics": topics_out,
    }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()

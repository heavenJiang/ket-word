"""Normalize the parsed KET list and match it against the Word Atlas dataset.

Usage:
    python3 scripts/ket/build_words.py

Reads:
    data/ket-wordlist.json              (from parse_wordlist.py)
    .local/word-atlas/word-atlas.json   (https://github.com/designfuchen/word-atlas, CC BY 4.0)
Writes:
    data/ket-words.json                 one learnable item per headword
    data/coverage.md                    what can be reused, what must be generated
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORDLIST = ROOT / "data/ket-wordlist.json"
ATLAS = ROOT / ".local/word-atlas/word-atlas.json"
OUT = ROOT / "data/ket-words.json"
REPORT = ROOT / "data/coverage.md"

# Kid-friendly topic ids and Chinese names, in learning-map order.
TOPICS = {
    "Colours": ("colours", "颜色"),
    "Family and Friends": ("family", "家人朋友"),
    "Food and Drink": ("food", "食物饮料"),
    "Clothes and Accessories": ("clothes", "衣服配饰"),
    "House and Home": ("home", "我的家"),
    "Education": ("school", "学校"),
    "The Natural World": ("nature", "大自然"),
    "Weather": ("weather", "天气"),
    "Time": ("time", "时间"),
    "Sport": ("sport", "运动"),
    "Hobbies and Leisure": ("hobbies", "爱好休闲"),
    "Health, Medicine and Exercise": ("health", "身体健康"),
    "Places: Town and City": ("town", "城镇"),
    "Places: Buildings": ("buildings", "建筑"),
    "Places: Countryside": ("countryside", "乡村"),
    "Shopping": ("shopping", "购物"),
    "Services": ("services", "公共服务"),
    "Travel and Transport": ("travel", "交通旅行"),
    "Work and Jobs": ("jobs", "职业"),
    "Entertainment and Media": ("media", "娱乐媒体"),
    "Communication and Technology": ("tech", "通讯科技"),
    "Appliances": ("appliances", "家用电器"),
    "Documents and Texts": ("documents", "文件书信"),
    "Measurements": ("measure", "度量"),
    "Personal Feelings, Opinions and Experiences (adjectives)": ("feelings", "感受描述"),
}

# Animals have no topic list in the PDF but are core for young learners.
ANIMALS = {
    "animal", "bear", "bee", "beetle", "bird", "butterfly", "camel", "cat",
    "chicken", "cow", "crocodile", "dinosaur", "dog", "dolphin", "duck",
    "elephant", "fish", "frog", "giraffe", "goat", "horse", "insect",
    "kangaroo", "kitten", "lion", "monkey", "mouse", "parrot", "penguin", "pet",
    "pig", "polar bear", "puppy", "rabbit", "sheep", "shark", "snake", "spider",
    "swan", "tail", "tiger", "tortoise", "whale", "wing", "zebra", "wild",
    "wildlife", "zoo",
}


# Headwords whose slash notation does not split cleanly.
FORMS_OVERRIDE = {
    "driving /driver’s licence": ["driving licence", "driver’s licence"],
    "at / @": ["at", "@"],
}


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def norm(s: str) -> str:
    return s.replace("’", "'").replace("é", "e").strip().lower()


def expand(s: str) -> list[str]:
    """'yog(h)urt' -> ['yoghurt','yogurt']; 'grey / gray' -> ['grey','gray']."""
    s = re.sub(r"\s+\((?:n|v|adj|adv|n & v|v & n|n & adj|v & adj|adj & n|n pl)\)$", "", s.strip())
    out: list[str] = []
    for part in re.split(r"\s*/\s*", s):
        stack = [part]
        while stack:
            cur = stack.pop()
            m = re.search(r"\(([^()]*)\)|\[([^\[\]]*)\]", cur)
            if not m:
                cur = re.sub(r"\s+", " ", cur).strip()
                if cur:
                    out.append(cur)
                continue
            inner = m.group(1) if m.group(1) is not None else m.group(2)
            stack.append(cur[: m.start()] + inner + cur[m.end():])
            stack.append(cur[: m.start()] + cur[m.end():])
    seen: list[str] = []
    for o in out:
        if o not in seen:
            seen.append(o)
    return seen


def forms_of(headword: str) -> list[str]:
    return FORMS_OVERRIDE.get(headword) or expand(headword)


def kind_of(word: str, pos: list[str]) -> str:
    if "phr v" in pos:
        return "phrasal"
    return "phrase" if " " in word else "word"


def build() -> None:
    src = json.loads(WORDLIST.read_text(encoding="utf-8"))
    atlas = json.loads(ATLAS.read_text(encoding="utf-8"))
    atlas_by = {norm(a["w"]): a for a in atlas}

    # merge duplicate headwords (e.g. 'visit (v)' + 'visit (n)', 'at' + 'at / @')
    merged: dict[str, dict] = {}
    for e in src["entries"]:
        key = norm(forms_of(e["word"])[0])
        if key in merged:
            m = merged[key]
            m["pos"] += [p for p in e["pos"] if p not in m["pos"]]
            m["examples"] += e["examples"]
            m["hints"] += [e["hint"]] if e["hint"] else []
        else:
            merged[key] = {**e, "hints": [e["hint"]] if e["hint"] else []}

    # topic index: every expanded form of every topic item
    topic_of: dict[str, list[str]] = defaultdict(list)
    for name, items in src["topics"].items():
        tid = TOPICS[name][0]
        for it in items:
            if it.startswith("January") or it.startswith("Monday"):
                continue  # word sets, handled below
            for f in expand(it):
                if tid not in topic_of[norm(f)]:
                    topic_of[norm(f)].append(tid)

    items: list[dict] = []
    used_ids: set[str] = set()
    for e in merged.values():
        forms = forms_of(e["word"])
        topics: list[str] = []
        for f in forms + [e["word"]]:
            for t in topic_of.get(norm(f), []):
                if t not in topics:
                    topics.append(t)
        if any(norm(f) in ANIMALS for f in forms):
            topics.append("animals")
        atlas_hit = next((atlas_by[norm(f)] for f in forms if norm(f) in atlas_by), None)
        iid = slug(forms[0])
        while iid in used_ids:
            iid += "-2"
        used_ids.add(iid)
        items.append({
            "id": iid,
            "word": forms[0],
            "forms": forms,
            "headword": e["word"],
            "pos": e["pos"],
            "kind": kind_of(forms[0], e["pos"]),
            "variant": e["variant"],
            "alt": e["alt"],
            "hints": e["hints"],
            "examples": e["examples"],
            "topics": topics,
            "atlas": atlas_hit["id"] if atlas_hit else None,
            "source": "list",
        })

    # Appendix 1 word sets: days, months, numbers, seasons, continents
    sets = {
        "time": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
                 "January", "February", "March", "April", "May", "June", "July", "August",
                 "September", "October", "November", "December",
                 "spring", "summer", "autumn", "winter"],
        "numbers": ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
                    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
                    "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty",
                    "seventy", "eighty", "ninety", "hundred", "thousand",
                    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
                    "ninth", "tenth", "eleventh", "twelfth", "twentieth", "thirtieth"],
        "world": ["Africa", "Antarctica", "Asia", "Australia", "Europe", "North America",
                  "South America", "China", "Chinese", "Brazil", "Brazilian", "Canada",
                  "Canadian", "France", "French", "Ireland", "Irish", "India", "Indian", "Italy",
                  "Italian", "Spain", "Spanish", "England", "English", "Britain", "British",
                  "America", "American", "Australian", "Japan", "Japanese"],
    }
    by_norm = {norm(f): it for it in items for f in it["forms"]}
    for tid, words in sets.items():
        for w in words:
            if norm(w) in by_norm:
                it = by_norm[norm(w)]
                if tid not in it["topics"]:
                    it["topics"].append(tid)
                continue
            a = atlas_by.get(norm(w))
            it = {
                "id": slug(w), "word": w, "forms": [w], "headword": w, "pos": [],
                "kind": kind_of(w, []), "variant": None, "alt": None, "hints": [],
                "examples": [], "topics": [tid], "atlas": a["id"] if a else None,
                "source": "word-set",
            }
            items.append(it)
            by_norm[norm(w)] = it

    for it in items:
        if not it["topics"]:
            it["topics"] = ["core"]

    topic_meta = [{"id": tid, "en": en, "zh": zh} for en, (tid, zh) in TOPICS.items()]
    topic_meta += [
        {"id": "animals", "en": "Animals", "zh": "动物"},
        {"id": "numbers", "en": "Numbers", "zh": "数字"},
        {"id": "world", "en": "Countries and Continents", "zh": "国家与大洲"},
        {"id": "core", "en": "Core words", "zh": "核心词"},
    ]
    OUT.write_text(json.dumps({
        "source": src["source"],
        "topics": topic_meta,
        "items": items,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    write_report(items, topic_meta, atlas_by)


def write_report(items: list[dict], topic_meta: list[dict], atlas_by: dict) -> None:
    n = len(items)
    hit = [i for i in items if i["atlas"]]
    miss = [i for i in items if not i["atlas"]]
    kinds = Counter(i["kind"] for i in items)
    cefr = Counter(atlas_by[norm(next(f for f in i["forms"] if norm(f) in atlas_by))]["cefr"]
                   for i in hit)
    by_topic: dict[str, list[dict]] = defaultdict(list)
    for i in items:
        for t in i["topics"]:
            by_topic[t].append(i)

    lines = [
        "# KET 词表 × Word Atlas 覆盖报告",
        "",
        "由 `scripts/ket/build_words.py` 生成，请勿手改。",
        "",
        f"- KET 可学条目：**{n}**（单词 {kinds['word']} · 短语 {kinds['phrase']} · 短语动词 {kinds['phrasal']}）",
        f"- Word Atlas 可复用（插画 + 英美音 + 例句音频）：**{len(hit)}**（{len(hit) / n:.0%}）",
        f"- 需要新生成：**{len(miss)}**",
        f"- 命中词在 Word Atlas 中的 CEFR 分布：" + "，".join(f"{k} {cefr[k]}" for k in sorted(cefr)),
        "",
        "注：即使命中，Word Atlas 的例句与插画面向成人，儿童版例句需要重新生成；插画与发音可作为首版素材。",
        "",
        "## 按话题",
        "",
        "| 话题 | 条目 | 可复用 | 缺失 |",
        "| --- | ---: | ---: | ---: |",
    ]
    for t in topic_meta:
        lst = by_topic.get(t["id"], [])
        h = sum(1 for i in lst if i["atlas"])
        lines.append(f"| {t['zh']} `{t['id']}` | {len(lst)} | {h} | {len(lst) - h} |")
    lines += ["", "## 未命中条目", "", ", ".join(sorted(i["word"] for i in miss)), ""]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{n} items, {len(hit)} matched Word Atlas ({len(hit) / n:.0%}), {len(miss)} to generate")


if __name__ == "__main__":
    build()

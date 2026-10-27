"""Parse the official Cambridge A2 Key vocabulary list PDF into JSON.

Usage:
    python3 scripts/ket/parse_wordlist.py [pdf] [out]

Defaults: .local/source/a2-key-vocabulary-list-2025.pdf -> data/ket-wordlist.json

The PDF has three parts:
  * pages 4-23: alphabetical list in two columns. Headwords are bold,
    example phrases are regular text starting with a bullet.
  * Appendix 1: word sets (numbers, days, months, countries...) as prose.
  * Appendix 2: topic lists in four columns.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = ROOT / ".local/source/a2-key-vocabulary-list-2025.pdf"
DEFAULT_OUT = ROOT / "data/ket-wordlist.json"

POS_TOKENS = {
    "abbrev", "adj", "adv", "av", "conj", "det", "exclam", "mv", "n", "phr",
    "v", "pl", "prep", "pron", "sing",
}
BULLET = "•"
FOOTER = re.compile(r"©\s*UCLES|^Page \d+ of|Vocabulary List$|^Schools$|A2 Key and Key for")


def group_lines(words: list[dict], tol: float = 2.5) -> list[list[dict]]:
    """Group pdfplumber words into visual lines, top to bottom, left to right."""
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if lines and abs(lines[-1][0]["top"] - w["top"]) <= tol:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(l, key=lambda w: w["x0"]) for l in lines]


def is_bold(w: dict) -> bool:
    return "Bold" in w["fontname"]


# Known errors in the source PDF, fixed after parsing.
OVERRIDES = {
    "chips": {"alt": "French fries"},  # PDF says "Am Eng: biscuit"
}


def parse_pos(group: str) -> list[str] | None:
    """'det, adj & pron' -> ['det','adj','pron']; None if not a POS group."""
    group = group.split("–")[0].replace("unc n", "n")  # 'adj – for colours', 'unc n'
    toks = [t for t in re.split(r"[\s,&]+", group.strip()) if t]
    if toks and all(t in POS_TOKENS for t in toks):
        out: list[str] = []
        i = 0
        while i < len(toks):
            # 'phr v' and 'prep phr' are two-token labels
            if toks[i] == "phr" and i + 1 < len(toks) and toks[i + 1] == "v":
                out.append("phr v"); i += 2; continue
            if toks[i] == "prep" and i + 1 < len(toks) and toks[i + 1] == "phr":
                out.append("prep phr"); i += 2; continue
            if toks[i] == "n" and i + 1 < len(toks) and toks[i + 1] in ("pl", "sing"):
                out.append(f"n {toks[i + 1]}"); i += 2; continue
            out.append(toks[i]); i += 1
        return out
    return None


def parse_headline(text: str) -> dict:
    """'biscuit (n) (Br Eng) (Am Eng: cookie)' -> structured entry."""
    head = text
    rest = ""
    # headword ends at the first ' (' — inner parens like yog(h)urt have no space
    idx = text.find(" (")
    if idx > 0:
        head, rest = text[:idx], text[idx:]
    entry: dict = {"word": head.strip(), "pos": [], "variant": None, "alt": None, "hint": None}
    for g in re.findall(r"\(([^()]*)\)", rest):
        pos = parse_pos(g)
        if pos is not None:
            entry["pos"] += pos
        elif g.strip() in ("Br Eng", "Am Eng"):
            entry["variant"] = "br" if g.strip() == "Br Eng" else "am"
        elif re.match(r"^(Br|Am) Eng:", g.strip()):
            entry["alt"] = g.split(":", 1)[1].strip()
        else:
            entry["hint"] = g.strip()
    return entry


def parse_alphabetical(pdf) -> list[dict]:
    entries: list[dict] = []
    for page in pdf.pages[3:23]:
        mid = page.width / 2
        words = page.extract_words(extra_attrs=["fontname"], keep_blank_chars=False)
        for col in (lambda w: w["x0"] < mid, lambda w: w["x0"] >= mid):
            lines = [l for l in group_lines([w for w in words if col(w)])
                     if not FOOTER.search(" ".join(w["text"] for w in l))]
            if not lines:
                continue
            # headwords sit at the column margin; examples and wraps are indented
            margin = min(l[0]["x0"] for l in lines)
            for line in lines:
                text = " ".join(w["text"] for w in line).strip()
                if not text:
                    continue
                if re.fullmatch(r"[A-Z]", text) and is_bold(line[0]):
                    continue  # letter heading
                if text.startswith(BULLET):
                    ex = text.lstrip(BULLET).strip()
                    if entries:
                        entries[-1]["examples"].append(ex)
                    continue
                if entries and entries[-1]["raw"].count("(") > entries[-1]["raw"].count(")"):
                    # headline wrapped onto the next line, e.g. '(Am Eng: kilogram)'
                    raw = entries[-1]["raw"] + " " + text
                    examples = entries[-1]["examples"]
                    entries[-1] = {**parse_headline(raw), "raw": raw, "examples": examples}
                    continue
                if line[0]["x0"] - margin < 6:
                    e = parse_headline(text)
                    e["raw"] = text
                    e["examples"] = []
                    entries.append(e)
                    continue
                # regular text without bullet: wrapped continuation
                if entries:
                    if entries[-1]["examples"]:
                        entries[-1]["examples"][-1] += " " + text
                    else:
                        extra = parse_headline("x " + text)
                        entries[-1]["pos"] += extra["pos"]
                        entries[-1]["variant"] = entries[-1]["variant"] or extra["variant"]
                        entries[-1]["alt"] = entries[-1]["alt"] or extra["alt"]
                        entries[-1]["raw"] += " " + text
    for e in entries:
        e.update(OVERRIDES.get(e["word"], {}))
        del e["raw"]
    return entries


def parse_word_sets(pdf) -> list[dict]:
    """Appendix 1, kept as prose sections; expanded into words separately."""
    text = pdf.pages[23].extract_text()
    lines = [l for l in text.split("\n") if l.strip() and not FOOTER.search(l)]
    sets: list[dict] = []
    for l in lines[3:]:
        if re.match(r"^[A-Z][a-z ,]+$", l) and len(l) < 60 and not l.endswith("etc."):
            sets.append({"name": l.strip(), "text": ""})
        elif sets:
            sets[-1]["text"] = (sets[-1]["text"] + " " + l.strip()).strip()
    return sets


def parse_topics(pdf) -> dict[str, list[str]]:
    """Appendix 2: four columns of items under bold-ish topic headings."""
    topics: dict[str, list[str]] = {}
    current = None
    for page in pdf.pages[24:32]:
        words = page.extract_words(extra_attrs=["fontname", "size"])
        for line in group_lines(words):
            text = " ".join(w["text"] for w in line).strip()
            if not text or FOOTER.search(text) or text in ("Appendix 2", "Topic Lists"):
                continue
            if all(is_bold(w) for w in line):
                current = text
                topics[current] = []
                continue
            if current is None:
                continue
            # split the line into cells by large horizontal gaps
            cells: list[list[dict]] = [[line[0]]]
            for prev, w in zip(line, line[1:]):
                if w["x0"] - prev["x1"] > 12:
                    cells.append([w])
                else:
                    cells[-1].append(w)
            topics[current] += [" ".join(w["text"] for w in c) for c in cells]
    return topics


def main() -> None:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    with pdfplumber.open(pdf_path) as pdf:
        entries = parse_alphabetical(pdf)
        sets = parse_word_sets(pdf)
        topics = parse_topics(pdf)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "source": "Cambridge English A2 Key and A2 Key for Schools Vocabulary List (August 2025), © UCLES",
        "entries": entries,
        "wordSets": sets,
        "topics": topics,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(entries)} entries, {len(sets)} word sets, {len(topics)} topics "
          f"({sum(len(v) for v in topics.values())} topic items) -> {out}")


if __name__ == "__main__":
    main()

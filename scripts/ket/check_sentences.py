"""Check the kid example sentences in content/topics/*.json.

    python3 scripts/ket/check_sentences.py [topic ...]

Reports (1) words in a sentence that are not on the KET list, allowing regular inflections and the
cast's names, and (2) words with no sentence that contains the word itself, which the fill-in-the-gap
question needs. build_app_data.py prints the same summary as a warning.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content/topics"
WORDS = ROOT / "data/ket-words.json"

# names of the recurring cast and places used in sentences; not vocabulary to learn
NAMES = {"lily", "max", "tom", "mum", "dad", "grandma", "grandpa", "kate", "ben", "sam", "mia", "brown", "green",
         "white", "smith", "spain", "london", "sunday", "monday", "friday", "saturday", "english"}
IRREGULAR = {
    "children": "child", "grandchildren": "grandchild", "mice": "mouse", "sheep": "sheep", "fish": "fish", "teeth": "tooth", "feet": "foot",
    "men": "man", "women": "woman", "people": "person", "geese": "goose", "knives": "knife", "loaves": "loaf",
    "wolves": "wolf", "leaves": "leaf", "potatoes": "potato", "tomatoes": "tomato",
    "is": "be", "are": "be", "am": "be", "was": "be", "were": "be", "'s": "be", "'m": "be", "'re": "be",
    "has": "have", "had": "have", "does": "do", "did": "do", "goes": "go", "went": "go", "gone": "go",
    "ate": "eat", "eaten": "eat", "drank": "drink", "made": "make", "gave": "give", "took": "take", "got": "get",
    "saw": "see", "came": "come", "ran": "run", "swam": "swim", "flew": "fly", "sang": "sing", "said": "say",
    "bought": "buy", "brought": "bring", "caught": "catch", "taught": "teach", "thought": "think", "found": "find",
    "made": "make", "sat": "sit", "slept": "sleep", "woke": "wake", "wrote": "write", "read": "read", "cut": "cut",
    "put": "put", "can't": "can", "don't": "do", "doesn't": "do", "isn't": "be", "aren't": "be", "won't": "will",
    "let's": "let", "i'm": "i", "it's": "it", "he's": "he", "she's": "she", "what's": "what", "that's": "that",
    "there's": "there", "we're": "we", "you're": "you", "they're": "they", "i'll": "i", "i'd": "i", "you'd": "you", "best": "good",
    "better": "good", "his": "he", "her": "she", "him": "he", "them": "they", "us": "we", "me": "i", "my": "i",
    "our": "we", "your": "you", "its": "it", "their": "they", "an": "a", "o'clock": "o'clock", "grew": "grow",
    "fell": "fall", "felt": "feel", "held": "hold", "left": "leave", "met": "meet", "told": "tell", "wore": "wear",
    "won": "win", "lay": "lie", "flies": "fly", "babies": "baby", "cherries": "cherry", "strawberries": "strawberry",
    "families": "family", "lit": "light", "hid": "hide", "drove": "drive", "rode": "ride", "began": "begin",
    "knew": "know", "kept": "keep", "built": "build", "spent": "spend", "sent": "send", "stood": "stand",
    "understood": "understand", "heard": "hear", "lost": "lose", "paid": "pay", "sold": "sell", "shook": "shake",
    "broke": "break", "chose": "choose", "forgot": "forget", "hung": "hang", "dug": "dig", "fed": "feed",
}


def vocabulary() -> set[str]:
    items = json.loads(WORDS.read_text(encoding="utf-8"))["items"]
    vocab: set[str] = set()
    for i in items:
        for f in [i["word"], i.get("headword") or "", *(i.get("forms") or []), i.get("alt") or "", i.get("variant") or ""]:
            for part in re.split(r"[ /]", f.lower()):
                if part:
                    vocab.add(part.strip("().,!?"))
    return vocab


def lemmas(tok: str) -> list[str]:
    """Candidate base forms of a token: itself, an irregular form, then regular endings."""
    out = [tok, IRREGULAR.get(tok, "")]
    for suf, rep in (("ies", "y"), ("ied", "y"), ("ier", "y"), ("iest", "y"), ("es", ""), ("s", ""), ("ed", ""),
                     ("ed", "e"), ("ing", ""), ("ing", "e"), ("er", ""), ("er", "e"), ("est", ""), ("est", "e"),
                     ("ly", "")):
        if tok.endswith(suf) and len(tok) > len(suf) + 1:
            stem = tok[: -len(suf)]
            out.append(stem + rep)
            if rep == "" and len(stem) > 2 and stem[-1] == stem[-2]:  # stopped, running, bigger
                out.append(stem[:-1])
    return [x for x in out if x]


def tokens(sentence: str) -> list[str]:
    """Lower-case words; a possessive 's is dropped (Lily's → lily)."""
    return [re.sub(r"'s$", "", t) if t not in IRREGULAR else t for t in re.findall(r"[a-z]+(?:[-'][a-z]+)*", sentence.lower())]


def has_word(sentence: str, word: str) -> bool:
    """The fill-in-the-gap question needs the word itself (any case) as a whole word in the sentence."""
    return re.search(rf"(?<![\w-]){re.escape(word)}(?![\w-])", sentence, re.IGNORECASE) is not None


def check(topics: list[str]) -> tuple[list[str], list[str], int]:
    vocab = vocabulary()
    items = {i["id"]: i for i in json.loads(WORDS.read_text(encoding="utf-8"))["items"]}
    unknown: list[str] = []
    no_gap: list[str] = []
    total = 0
    for path in sorted(CONTENT.glob("*.json")):
        if topics and path.stem not in topics:
            continue
        for w in json.loads(path.read_text(encoding="utf-8"))["words"]:
            sentences = [w["en"], *(en for en, _ in w.get("more", []))]
            total += len(sentences)
            for s in sentences:
                bad = [t for t in tokens(s) if t not in NAMES and not any(l in vocab for l in lemmas(t))]
                if bad:
                    unknown.append(f"{path.stem}/{w['id']}: {s}  ← {', '.join(sorted(set(bad)))}")
            word = items[w.get("of", w["id"])]["word"]  # a second-meaning card (can.2) checks its word
            if not any(has_word(s, word) for s in sentences):
                no_gap.append(f"{path.stem}/{w['id']}")
    return unknown, no_gap, total


def main() -> None:
    unknown, no_gap, total = check(sys.argv[1:])
    print(f"{total} sentences")
    print(f"{len(unknown)} with words off the KET list:")
    for u in unknown:
        print("  " + u)
    print(f"{len(no_gap)} words with no fill-in-the-gap sentence: {', '.join(no_gap)}")


if __name__ == "__main__":
    main()

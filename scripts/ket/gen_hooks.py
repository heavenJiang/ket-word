"""Write a memory hook for every word with the local Qwen model, checked by rules, into content/hooks.json.

A hook is one short Chinese line that ties a word a child keeps forgetting to something they know. The
app shows it only once a word proves hard (forgotten twice after being learnt), so it is a rescue, not
the way every word is taught. Kinds, in order of preference:
    split     bookshop = book 书 + shop 商店
    affix     care（小心）+ ful（充满）= careful 小心的
    contrast  quiet 安静 / quite 相当：quiet 的 e 在后面
    story     a little scene joining the word's form or sound to its meaning
    sound     a Chinese sound-alike in 「」, only when nothing else works: L1 sound-alikes can pull
              pronunciation off, so the app adds that the recording is how the word sounds
Every hook must contain the word; split and affix parts must spell it; nothing scary or rude.

Usage (the model runs on the GPU box; take the llm lease so nothing else runs there):
    python3 ~/.claude/tools/gpu-box/gpu_box.py run --kind llm -- python3 scripts/ket/gen_hooks.py [--only cat,dog] [--limit 40]
Words that already have a hook are skipped; --redo writes the listed ones again.
Env: QWEN_URL (default: the box on the LAN).
"""

from __future__ import annotations

import argparse
import functools
import json
import os
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content/topics"
OUT = ROOT / "content/hooks.json"
URL = os.environ.get("QWEN_URL", "http://192.168.31.128:47832/v1").rstrip("/")
BATCH = 20
# thinking keeps the model to the rules (real word parts, letters counted right) at about 5 minutes a batch
THINK = os.environ.get("QWEN_THINK", "1") != "0"
MAX_LEN = 45
KINDS = ["split", "affix", "contrast", "story", "sound"]
BANNED = ["死", "杀", "血", "鬼", "尸", "屁", "屎", "尿", "滚", "笨蛋", "傻"]
AFFIXES = {"un", "re", "dis", "im", "in", "non", "pre", "mis", "over", "under", "er", "or", "ist", "ful", "less", "ly",
           "ness", "ment", "tion", "sion", "able", "ible", "y", "al", "ous", "ive", "en", "ing", "ed", "est", "ish",
           "ship", "hood", "ian", "ese", "ty", "ity", "th", "teen", "s", "es", "ant", "ent", "ance", "ence"}


def known_words() -> set[str]:
    """Real English words: the KET list and Word Atlas, so a split or a contrast never rests on a made-up part."""
    ket = json.loads((ROOT / "data/ket-words.json").read_text(encoding="utf-8"))["items"]
    out = {f.lower() for i in ket for f in [i["word"], *i.get("forms", [])] for f in f.split()}
    atlas = ROOT / ".local/word-atlas/word-atlas.json"
    if atlas.exists():
        out |= {a["w"].lower() for a in json.loads(atlas.read_text(encoding="utf-8")) if " " not in a["w"]}
    return out


KNOWN = known_words()


def close(a: str, b: str) -> bool:
    """Spellings near enough to mix up: one inside the other, or a couple of letters apart."""
    if a in b or b in a:
        return True
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return d[len(b)] <= 2

SPEC = """你在给 10–12 岁的中国孩子写英语单词的“记忆小窍门”。孩子已经学过这个词，但总是忘，需要一句话帮他记住。

每个词写一条，从下面五种里选最合适的一种（越靠前越优先，能用前面的就不用后面的）：
1. split 拆开记：这个词由孩子认识的英语单词组成。格式“A 中文 + B 中文 = 单词 中文”。只在真的能拆成两个常见词时用。
2. affix 词缀：常见前缀/后缀（un- re- -er -or -ful -less -ly -ness -ment -tion -y 等）。格式“词根（中文）+ 词缀（中文）= 单词 中文”。
3. contrast 别弄混：和一个长得像、容易混的英语词对比，点出区别（哪个字母不同、意思不同）。
4. story 想个画面：一个具体、有趣的小画面，把单词的拼写或读音和意思连起来。
5. sound 谐音：只有前面都不合适时才用。中文谐音写在「」里，要尽量接近真实读音，不能是不雅的词。

规则：
- 一句话，中文不超过 40 个字，必须原样包含这个英语单词。
- 不要编造假的词源；拆分和词缀的各部分拼起来必须正好是这个单词，而且每一部分都是真的英语单词或真的词缀（croc + odile、gi + raffe 这种编出来的不行）。
- 说到字母时要数对：说“多了哪几个字母”之前先核对拼写。
- 像 cat、dog 这种简单具体的词，用字母形状编画面就很好（c 像猫耳朵）；不要硬拆。
- 正面、温暖，不吓人，不出现死亡、暴力、厕所类字眼。
- 不用拼音，不写音标。

例子：
{"id": "bookshop", "kind": "split", "text": "book 书 + shop 商店 = bookshop 书店"}
{"id": "careful", "kind": "affix", "text": "care（小心）+ ful（充满……的）= careful 小心的"}
{"id": "unhappy", "kind": "affix", "text": "un（不）+ happy（开心）= unhappy 不开心的"}
{"id": "quiet", "kind": "contrast", "text": "quiet 安静的，quite 相当：安静的 quiet 把 e 藏在最后悄悄地"}
{"id": "desert", "kind": "contrast", "text": "desert 沙漠只有一个 s，dessert 甜点有两个 s，因为甜点想多吃一份"}
{"id": "eye", "kind": "story", "text": "eye 像一张脸：两个 e 是眼睛，中间的 y 是鼻子"}
{"id": "bed", "kind": "story", "text": "bed 像一张床：b 和 d 是床头床尾，e 是躺在中间的人"}
{"id": "sofa", "kind": "sound", "text": "sofa 读起来就像「沙发」，它本来就是沙发"}

只输出一个 JSON 数组，每个元素 {"id": ..., "kind": ..., "text": ...}，不要别的文字。"""


def words() -> list[dict]:
    """Every word card to hook, once: second meanings share their word's spelling and are left out."""
    spelled = {i["id"]: i["word"] for i in json.loads((ROOT / "data/ket-words.json").read_text(encoding="utf-8"))["items"]}
    seen: dict[str, dict] = {}
    for p in sorted(CONTENT.glob("*.json")):
        for w in json.loads(p.read_text(encoding="utf-8"))["words"]:
            if w.get("of") or w["id"] in seen or len(re.sub(r"[^a-z]", "", w["id"])) < 3:
                continue
            seen[w["id"]] = {"id": w["id"], "word": spelled[w["id"]], "zh": w["zh"], "en": w["en"]}
    return list(seen.values())


@functools.cache
def app_words() -> dict[str, dict]:
    return {w["id"]: w for p in (ROOT / "public/data/topics").glob("*.json") for w in json.loads(p.read_text(encoding="utf-8"))["words"]}


def easy(word_id: str) -> bool:
    """A short, pictured everyday (A1) single word: children rarely forget these, and hooks for them are forced."""
    w = app_words().get(word_id)
    return bool(w and w.get("spell") and w["media"].get("img") and len(letters(w["word"])) < 7)


def letters(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def problems(w: dict, h: dict) -> list[str]:
    """Why a hook is not good enough, or nothing."""
    out = []
    text, kind = h.get("text", ""), h.get("kind")
    if kind not in KINDS:
        out.append(f"kind 必须是 {KINDS} 之一")
    if len(text) > MAX_LEN:
        out.append(f"太长（{len(text)} 字），不超过 40 个字")
    if w["word"].lower() not in text.lower():
        out.append(f"要原样包含单词 {w['word']}")
    if any(b in text for b in BANNED):
        out.append("有不合适的字眼")
    if kind in ("split", "affix"):
        head = text.split("=")[0]
        if "+" not in head or "=" not in text:
            out.append("拆分/词缀要写成“A + B = 单词”")
        elif letters("".join(parts := re.findall(r"[A-Za-z]+", head))) != letters(w["word"]):
            out.append(f"拆开的部分拼起来不是 {w['word']}")
        elif kind == "split" and not all(x.lower() in KNOWN for x in parts):
            out.append("拆开的每一部分都必须是真的英语单词（不要编）；拆不成两个真单词就换别的方法")
        elif kind == "affix" and not (any(x.lower() in KNOWN and x.lower() not in AFFIXES for x in parts) and any(x.lower() in AFFIXES for x in parts)):
            out.append("词缀要是常见的真词缀（un- re- -er -ful -ly 等），词根要是真单词；不是的话换别的方法")
    others = [x.lower() for x in re.findall(r"[A-Za-z]{2,}", text) if x.lower() not in w["word"].lower().split()]
    if kind == "contrast" and not any(x in KNOWN and close(x, letters(w["word"])) for x in others):
        out.append("别弄混要写出另一个拼写很像的真实英语词（只差一两个字母）")
    if kind == "sound" and not re.search(r"「[^」]+」", text):
        out.append("谐音要写在「」里")
    return out


def model() -> str:
    with urllib.request.urlopen(f"{URL}/models", timeout=30) as r:
        return json.load(r)["data"][0]["id"]


def ask(model_id: str, batch: list[dict], notes: str = "") -> list[dict]:
    lines = "\n".join(json.dumps({"id": w["id"], "word": w["word"], "zh": w["zh"], "例句": w["en"]}, ensure_ascii=False) for w in batch)
    msg = f"给下面每个词写一条记忆小窍门：\n{lines}" + (f"\n\n上次有这些问题，请改正：\n{notes}" if notes else "")
    body = json.dumps({
        "model": model_id,
        "messages": [{"role": "system", "content": SPEC}, {"role": "user", "content": msg}],
        "temperature": 0.7,
        "chat_template_kwargs": {"enable_thinking": THINK},
    }).encode()
    req = urllib.request.Request(f"{URL}/chat/completions", data=body, headers={"Content-Type": "application/json"})
    for attempt in range(4):  # the gateway drops the odd request: retry
        try:
            with urllib.request.urlopen(req, timeout=290) as r:
                text = json.load(r)["choices"][0]["message"]["content"]
            text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
            got = json.loads(text)
            if isinstance(got, dict):  # sometimes wrapped: {"hooks": [...]}
                got = next((v for v in got.values() if isinstance(v, list)), [got])
            return [h for h in got if isinstance(h, dict)]
        except Exception as e:  # noqa: BLE001 - any failure is retried, then the batch is skipped
            if attempt == 3:
                print(f"  ! batch failed: {e}")
                return []
            time.sleep(5 * (attempt + 1))
    return []


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated word ids")
    ap.add_argument("--redo", default="", help="comma-separated word ids to write again")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--skip-easy", action="store_true", help="leave out short, pictured A1 words (cat, dog): rarely forgotten")
    a = ap.parse_args()
    hooks = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    only = {x for x in a.only.split(",") if x}
    redo = {x for x in a.redo.split(",") if x}
    todo = [w for w in words() if (not only or w["id"] in only) and (w["id"] not in hooks or w["id"] in redo)]
    if a.skip_easy:
        todo = [w for w in todo if not easy(w["id"])]
    if a.limit:
        todo = todo[: a.limit]
    model_id = model()
    print(f"{len(todo)} words to hook with {model_id}")
    failed: list[str] = []
    for s in range(0, len(todo), BATCH):
        batch = todo[s : s + BATCH]
        by_id = {w["id"]: w for w in batch}
        got: dict[str, dict] = {}
        notes = ""
        for _ in range(2):  # one retry for the ones that failed the checks
            left = [w for w in batch if w["id"] not in got]
            if not left:
                break
            bad = []
            for h in ask(model_id, left, notes):
                w = by_id.get(h.get("id", ""))
                if not w or w["id"] in got:
                    continue
                if p := problems(w, h):
                    bad.append(f"{w['id']}：{'；'.join(p)}")
                else:
                    got[w["id"]] = {"kind": h["kind"], "text": h["text"].strip()}
            notes = "\n".join(bad)
        hooks.update(got)
        for w in batch:  # a redo that failed the checks must not leave the old hook behind
            if w["id"] in redo and w["id"] not in got:
                hooks.pop(w["id"], None)
        failed += [w["id"] for w in batch if w["id"] not in got]
        OUT.write_text(json.dumps(hooks, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(f"  [{min(s + BATCH, len(todo))}/{len(todo)}] {len(got)}/{len(batch)} ok", flush=True)
    if failed:
        print(f"{len(failed)} without a hook: {','.join(failed)}")


if __name__ == "__main__":
    main()

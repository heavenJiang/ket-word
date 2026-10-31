"""Acceptance tests for check_draft.py and gen_comfy.py reading drafts (run: python3 -m pytest scripts/ket)."""

import copy
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ket/check_draft.py"

AFTERNOON = {
    "id": "afternoon", "zh": "下午", "chunks": ["af", "ter", "noon"], "emoji": "🌤️",
    "en": "We play in the park in the afternoon.", "sz": "我们下午在公园玩。",
    "scene": "Lily and Tom playing on swings in a sunny park in the afternoon.",
    "more": [["See you this afternoon!", "下午见！"], ["Tom has a sleep after lunch.", "Tom 午饭后睡一觉。"]],
}
CLOCK = {  # clock already has a picture (content/media/ai/clock.webp), so it needs no scene
    "id": "clock", "zh": "钟；时钟", "chunks": ["clock"], "emoji": "🕰️",
    "en": "The clock says ten o'clock.", "sz": "钟显示十点。",
    "more": [["Look at the clock.", "看看钟。"], ["The clock is on the wall.", "钟挂在墙上。"]],
}


def run(tmp_path, words, *flags, name="time"):
    p = tmp_path / f"{name}.json"
    p.write_text(json.dumps({"words": words}, ensure_ascii=False), encoding="utf-8")
    r = subprocess.run([sys.executable, "-I", str(SCRIPT), str(p), *flags], capture_output=True, text=True, cwd=ROOT)
    return r.returncode, r.stdout + r.stderr


def test_partial_ok(tmp_path):
    code, out = run(tmp_path, [AFTERNOON, CLOCK], "--partial")
    assert code == 0, out


def test_full_reports_missing_official_words(tmp_path):
    code, out = run(tmp_path, [AFTERNOON, CLOCK])
    assert code == 1
    assert "official words without content" in out and "midnight" in out


def test_off_list_word(tmp_path):
    w = copy.deepcopy(AFTERNOON)
    w["more"][0] = ["I play the xylophone in the afternoon.", "我下午弹木琴。"]
    code, out = run(tmp_path, [w], "--partial")
    assert code == 1 and "xylophone" in out


def test_no_gap_sentence(tmp_path):
    w = copy.deepcopy(AFTERNOON)
    w["en"] = "We play in the park after lunch."
    w["more"] = [["See you later!", "回头见！"]]
    code, out = run(tmp_path, [w], "--partial")
    assert code == 1 and "afternoon" in out and "gap" in out


def test_needs_scene_without_picture(tmp_path):
    w = {  # hello is an emoji-only card, so it has no picture in content/media to fall back on
        "id": "hello", "zh": "你好", "chunks": ["hel", "lo"], "emoji": "👋",
        "en": "Hello, Mia! Are you OK?", "sz": "Mia，你好！你没事吧？",
        "more": [["Hello, Grandpa. How are you?", "爷爷，你好。你好吗？"], ["The phone rings. Hello? Who is it?", "电话响了。喂？是谁呀？"]],
    }
    code, out = run(tmp_path, [w], "--partial", name="core-hello")
    assert code == 1 and "hello" in out and "scene" in out


def test_chunks_must_spell_word(tmp_path):
    w = copy.deepcopy(AFTERNOON)
    w["chunks"] = ["af", "ter", "noo"]
    code, out = run(tmp_path, [w], "--partial")
    assert code == 1 and "chunks" in out


def test_unknown_id(tmp_path):
    w = copy.deepcopy(AFTERNOON)
    w["id"] = "teatime"
    code, out = run(tmp_path, [w], "--partial")
    assert code == 1 and "teatime" in out


def test_gen_comfy_reads_drafts():
    sys.path.insert(0, str(ROOT / "scripts/ket"))
    import gen_comfy

    got = gen_comfy.words({"give-somebody-a-call"})
    assert [w["id"] for w in got] == ["give-somebody-a-call"]
    assert got[0]["scene"].startswith("Lily talking happily on a phone")
    # a word in both an open topic and a draft is listed once, from the open topic
    assert len([w for w in gen_comfy.words(set()) if w["id"] == "clock"]) == 1


def test_no_picture_card_needs_no_scene(tmp_path):
    the = {"id": "the", "zh": "这；那（定冠词）", "chunks": ["the"], "emoji": "👉", "picture": False,
           "en": "Tom finds the ball under the bed.", "sz": "Tom 在床底下找到了那个球。",
           "more": [["Close the door, please.", "请关上门。"], ["Max is in the garden.", "Max 在花园里。"]]}
    code, out = run(tmp_path, [the], "--partial", name="core-little")
    assert code == 0, out
    code, out = run(tmp_path, [{**the, "scene": "a ball under a bed"}], "--partial", name="core-little")
    assert code == 1 and "keep one" in out

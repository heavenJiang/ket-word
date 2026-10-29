"""Generate illustrations with ComfyUI + Qwen-Image 2512, in a children's picture-book style.

Usage:
    python3 scripts/ket/gen_comfy.py [--only bear,can] [-n 2]   # candidates -> .local/gen/qwen-image/<id>-<k>.webp
    python3 scripts/ket/gen_comfy.py --missing [-n 2]            # only words and pages with no picture picked yet
    python3 scripts/ket/gen_comfy.py --sheet [--missing|--only]  # contact sheets -> .local/gen/qwen-image/sheet-<n>.png
    python3 scripts/ket/gen_comfy.py --pick bear=2,can=1          # chosen -> content/media/ai/<id>.webp

Text-to-image from each word's "scene". Recurring characters (Lily, Max, Mum, Dad) are swapped for a
fixed look so they stay the same from picture to picture and their names never reach the prompt, which
the model would happily letter into the image. Qwen-Image replaced FLUX.1-dev after a side-by-side test
(2026-10-29): it follows the scene closely and keeps the cast's looks; the pictures picked before then
are FLUX. New scenes are drawn in batches: write the scene, then run --missing once for everything new.
Candidates that already exist are skipped, so an interrupted run resumes; delete a candidate to redraw
it. Every candidate must be reviewed on a contact sheet before --pick. build_app_data.py prefers
content/media/ai over the hand-drawn SVG renders, which stay as fallback.

Env: COMFY_URL (default: the generation box on the LAN), COMFY_UNET.
Needs Pillow (pip install pillow).
"""

from __future__ import annotations

import argparse
import io
import json
import os
import random
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content/topics"
OUT = ROOT / "content/media/ai"
GEN = ROOT / ".local/gen/qwen-image"  # FLUX candidates stay in .local/gen, so they are not mistaken for done

URL = os.environ.get("COMFY_URL", "http://192.168.31.128:8188").rstrip("/")
UNET = os.environ.get("COMFY_UNET", "qwen_image_2512_fp8_e4m3fn.safetensors")

STYLE = (
    "Cute children's picture book illustration, soft gouache and coloured pencil, warm bright cheerful colours, "
    "rounded friendly shapes, gentle soft light, plain soft pastel background, the subject large and centred, "
    "simple and easy for a young child to recognise, no text, no letters, no words."
)
NEGATIVE = "text, letters, words, writing, watermark, signature, blurry, deformed hands, extra fingers, ugly"
CAST = {
    "Lily": "a cheerful 9-year-old girl with shoulder-length brown hair, a yellow t-shirt and blue dungarees",
    "Max": "a small fluffy cream-coloured puppy with floppy ears and a red collar",
    "Mum": "a grown-up woman in her late thirties, a smiling mother with dark hair in a bun and a green cardigan",
    "Dad": "a grown-up man in his early forties, a smiling father with short brown hair, round glasses and a blue jumper",
    "Tom": "a cheeky 6-year-old boy with messy brown hair and a red t-shirt",
    "Grandma": "a cheerful grandmother with curly grey hair in a bun, round glasses and a red cardigan",
    "Grandpa": "a jolly grandfather with white hair, a white moustache and a green knitted waistcoat",
    "Aunt Kate": "a young woman in her thirties with curly red hair and a purple dress",
    "Uncle Ben": "a big jolly man in his forties with a short brown beard and a checked shirt",
    "Sam": "a 10-year-old boy with black hair, glasses and a green hoodie",
    "Mia": "a 9-year-old girl with black hair in two buns, a pink t-shirt and a denim skirt",
}
# "Lily wearing a party dress": the look without the usual clothes, which would otherwise win.
LOOK = {
    "Lily": "a cheerful 9-year-old girl with shoulder-length brown hair",
    "Tom": "a cheeky 6-year-old boy with messy brown hair",
}
# Second and later mentions of a character use a short reference instead of the full look.
SHORT = {
    "Lily": "the girl", "Max": "the puppy", "Mum": "the mother", "Dad": "the father", "Tom": "the little boy",
    "Grandma": "the grandmother", "Grandpa": "the grandfather", "Aunt Kate": "the aunt", "Uncle Ben": "the uncle",
    "Sam": "the boy with glasses", "Mia": "the girl with black buns",
}


def prompt(scene: str) -> str:
    seen: set[str] = set()

    def sub(m: re.Match) -> str:  # full look on first mention, a short reference after
        name = m.group(1)
        if name in seen:
            return SHORT[name]
        seen.add(name)
        return LOOK[name] if m.group(2) and name in LOOK else CAST[name]

    names = "|".join(sorted(CAST, key=len, reverse=True))
    scene = re.sub(rf"\b({names})\b(?: the (?:dog|puppy))?(?=( wearing\b))?", sub, scene)
    return f"{scene} {STYLE}"


def call(path: str, data: bytes | None = None) -> bytes:
    req = urllib.request.Request(URL + path, data=data, headers={"Content-Type": "application/json"} if data else {})
    for attempt in range(5):  # the generation box is on Wi-Fi: ride out short network drops
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.URLError:
            if attempt == 4:
                raise
            time.sleep(15 * (attempt + 1))


def workflow(text: str, seed: int) -> dict:
    return {
        "unet": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "shift": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["unet", 0], "shift": 3.1}},
        "clip": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image"}},
        "vae": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": text}},
        "neg": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": NEGATIVE}},
        "latent": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "sample": {"class_type": "KSampler", "inputs": {
            "model": ["shift", 0], "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["latent", 0],
            "seed": seed, "steps": 30, "cfg": 4.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "decode": {"class_type": "VAEDecode", "inputs": {"samples": ["sample", 0], "vae": ["vae", 0]}},
        "save": {"class_type": "SaveImage", "inputs": {"images": ["decode", 0], "filename_prefix": "ket-word"}},
    }


def run(graph: dict) -> bytes:
    body = json.dumps({"prompt": graph, "client_id": "ket-word"}).encode()
    pid = json.loads(call("/prompt", body))["prompt_id"]
    while True:
        time.sleep(2)
        h = json.loads(call(f"/history/{pid}")).get(pid)
        if not h:
            continue
        if h.get("status", {}).get("status_str") == "error":
            raise RuntimeError(json.dumps(h["status"].get("messages", []))[:400])
        img = h.get("outputs", {}).get("save", {}).get("images", [None])[0]
        if img:
            return call("/view?" + urllib.parse.urlencode(img))


def to_webp(data: bytes, dest: Path) -> None:
    Image.open(io.BytesIO(data)).convert("RGB").resize((512, 512), Image.LANCZOS).save(dest, "WEBP", quality=80, method=6)


def words(only: set[str]) -> list[dict]:
    """Words with a scene, each id once (chicken and fish are shared across topics), then story pages
    as story-<story>-<page>."""
    seen: dict[str, dict] = {}
    for p in sorted(CONTENT.glob("*.json")):
        for w in json.loads(p.read_text(encoding="utf-8"))["words"]:
            if w.get("scene") and w["id"] not in seen and (not only or w["id"] in only):
                seen[w["id"]] = w
    for p in sorted((ROOT / "content/stories").glob("*.json")):
        st = json.loads(p.read_text(encoding="utf-8"))
        for n, page in enumerate(st["pages"], 1):
            sid = f"story-{st['id']}-{n}"
            if not only or sid in only or f"story-{st['id']}" in only:
                seen[sid] = {"id": sid, "scene": page["scene"]}
    return list(seen.values())


def sheet(todo: list[dict]) -> None:
    """Contact sheets, 6 words per sheet, one row per word: current picture, then every candidate."""
    t = 256
    for s in range(0, len(todo), 6):
        rows = []
        for w in todo[s:s + 6]:
            cands = sorted((p for p in GEN.glob(f"{w['id']}-*.webp") if re.fullmatch(rf"{re.escape(w['id'])}-\d+", p.stem)),
                           key=lambda p: int(p.stem.rsplit("-", 1)[1]))  # "ice-*" must not match ice-cream-1
            rows.append([(f"{w['id']} (now)", ROOT / f"public/media/img/{w['id']}.webp")] + [(c.stem, c) for c in cands])
        img = Image.new("RGB", (max(len(r) for r in rows) * t, len(rows) * t), "white")
        d = ImageDraw.Draw(img)
        for y, row in enumerate(rows):
            for x, (label, p) in enumerate(row):
                if p.exists():
                    img.paste(Image.open(p).convert("RGB").resize((t, t)), (x * t, y * t))
                d.rectangle((x * t, y * t, x * t + 8 + 7 * len(label), y * t + 18), fill="white")
                d.text((x * t + 4, y * t + 4), label, fill="red")
        dest = GEN / f"sheet-{s // 6 + 1}.png"
        img.save(dest)
        print(f"  {dest.relative_to(ROOT)}")


def pick(spec: str) -> None:
    for item in spec.split(","):
        wid, k = item.split("=")
        src = GEN / f"{wid}-{k}.webp"
        if not src.exists():
            raise SystemExit(f"missing {src}")
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f"{wid}.webp").write_bytes(src.read_bytes())
        print(f"  picked {src.name} -> content/media/ai/{wid}.webp")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated word ids")
    ap.add_argument("-n", type=int, default=2, help="candidates per word")
    ap.add_argument("--missing", action="store_true", help="only words and pages with no picture in content/media/ai")
    ap.add_argument("--sheet", action="store_true", help="build contact sheets of existing candidates")
    ap.add_argument("--pick", default="", help="id=k,... copy chosen candidates into content/media/ai")
    a = ap.parse_args()
    if a.pick:
        return pick(a.pick)

    todo = words({x for x in a.only.split(",") if x})
    if a.missing:
        todo = [w for w in todo if not (OUT / f"{w['id']}.webp").exists()]
    GEN.mkdir(parents=True, exist_ok=True)
    if a.sheet:
        return sheet(todo)
    print(f"{len(todo)} words x {a.n} candidates with {UNET} at {URL}")
    for w in todo:
        for k in range(1, a.n + 1):
            dest = GEN / f"{w['id']}-{k}.webp"
            if dest.exists():
                continue
            t = time.time()
            to_webp(run(workflow(prompt(w["scene"]), random.randrange(2**32))), dest)
            print(f"  {w['id']}-{k} ({time.time() - t:.0f}s)", flush=True)


if __name__ == "__main__":
    main()

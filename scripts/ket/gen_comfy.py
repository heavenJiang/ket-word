"""Generate illustrations with ComfyUI + FLUX.1-dev, in a children's picture-book style.

Usage:
    python3 scripts/ket/gen_comfy.py [--only bear,can] [-n 2]   # candidates -> .local/gen/<id>-<k>.webp
    python3 scripts/ket/gen_comfy.py --sheet [--only ...]        # contact sheets -> .local/gen/sheet-<n>.png
    python3 scripts/ket/gen_comfy.py --pick bear=2,can=1          # chosen -> content/media/ai/<id>.webp

Text-to-image from each word's "scene". Recurring characters (Lily, Max, Mum, Dad) are swapped for a
fixed look so they stay the same from picture to picture and their names never reach the prompt, which
FLUX would happily letter into the image. Candidates that already exist are skipped, so an interrupted
run resumes; delete a candidate to redraw it. Every candidate must be reviewed on a contact sheet before
--pick. build_app_data.py prefers content/media/ai over the hand-drawn SVG renders, which stay as fallback.

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
GEN = ROOT / ".local/gen"

URL = os.environ.get("COMFY_URL", "http://192.168.31.128:8188").rstrip("/")
UNET = os.environ.get("COMFY_UNET", "flux1-dev-fp8.safetensors")

STYLE = (
    "Cute children's picture book illustration, soft gouache and coloured pencil, warm bright cheerful colours, "
    "rounded friendly shapes, gentle soft light, plain soft pastel background, the subject large and centred, "
    "simple and easy for a young child to recognise, no text, no letters, no words."
)
CAST = {
    "Lily": "a cheerful 9-year-old girl with shoulder-length brown hair, a yellow t-shirt and blue dungarees",
    "Max": "a small fluffy cream-coloured puppy with floppy ears and a red collar",
    "Mum": "a grown-up woman in her late thirties, a smiling mother with dark hair in a bun and a green cardigan",
    "Dad": "a grown-up man in his early forties, a smiling father with short brown hair, round glasses and a blue jumper",
}


def prompt(scene: str) -> str:
    seen: set[str] = set()

    def sub(m: re.Match) -> str:  # full look on first mention, a short reference after
        name = m.group(1)
        if name in seen:
            return {"Lily": "the girl", "Max": "the puppy", "Mum": "the mother", "Dad": "the father"}[name]
        seen.add(name)
        return CAST[name]

    scene = re.sub(r"\b(Lily|Max|Mum|Dad)\b(?: the (?:dog|puppy))?", sub, scene)
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
        "clip": {"class_type": "DualCLIPLoader", "inputs": {
            "clip_name1": "t5xxl_fp8_e4m3fn.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux"}},
        "vae": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["clip", 0], "text": text}},
        "guide": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["pos", 0], "guidance": 3.5}},
        "neg": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["pos", 0]}},
        "latent": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "sample": {"class_type": "KSampler", "inputs": {
            "model": ["unet", 0], "positive": ["guide", 0], "negative": ["neg", 0], "latent_image": ["latent", 0],
            "seed": seed, "steps": 24, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
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
    """Words with a scene, each id once (chicken and fish are shared across topics)."""
    seen: dict[str, dict] = {}
    for p in sorted(CONTENT.glob("*.json")):
        for w in json.loads(p.read_text(encoding="utf-8"))["words"]:
            if w.get("scene") and w["id"] not in seen and (not only or w["id"] in only):
                seen[w["id"]] = w
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
    ap.add_argument("--sheet", action="store_true", help="build contact sheets of existing candidates")
    ap.add_argument("--pick", default="", help="id=k,... copy chosen candidates into content/media/ai")
    a = ap.parse_args()
    if a.pick:
        return pick(a.pick)

    todo = words({x for x in a.only.split(",") if x})
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

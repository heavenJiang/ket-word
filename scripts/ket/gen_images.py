"""Generate illustrations for words that have a "scene" in content/topics, in the Word Atlas style.

Usage:
    export KET_IMAGE_API_KEY=...                     # required
    export KET_IMAGE_BASE_URL=https://api.openai.com/v1   # any OpenAI-compatible endpoint
    export KET_IMAGE_MODEL=gpt-image-1               # optional
    python3 scripts/ket/gen_images.py [--only bear,can] [--force]

Writes content/media/ai/<id>.webp (512px). build_app_data.py prefers these over the hand-drawn
SVG renders and Word Atlas images. Needs Pillow (pip install pillow). Review every result on a contact sheet before use.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content/topics"
OUT = ROOT / "content/media/ai"

# Same art direction as Word Atlas (scripts/atlas/gen_images.py), so new pictures sit beside
# the reused ones; plus a line keeping people and scenes child-friendly.
STYLE = (
    "Mid-century modern editorial illustration, like a plate from a vintage illustrated field guide. "
    "Strict limited palette: deep ink navy, warm terracotta, mustard ochre, muted sage green and soft sky blue on warm cream paper. "
    "Flat geometric shapes, confident clean silhouettes, subtle risograph grain and paper texture, gentle shading, "
    "one clear focal subject with generous negative space, centered square composition, calm and charming mood. "
    "Friendly and suitable for young children. "
    "Absolutely no text, letters, words, numbers, captions, signs, logos, watermarks or frames."
)


def generate(scene: str, base: str, key: str, model: str) -> bytes:
    body = json.dumps({
        "model": model,
        "prompt": f"{STYLE}\n\nScene: {scene}",
        "size": "1024x1024",
        "n": 1,
    }).encode()
    req = urllib.request.Request(
        base.rstrip("/") + "/images/generations",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.loads(r.read())["data"][0]
    if d.get("b64_json"):
        return base64.b64decode(d["b64_json"])
    with urllib.request.urlopen(d["url"], timeout=120) as r:  # some providers return a URL
        return r.read()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated word ids")
    ap.add_argument("--force", action="store_true", help="regenerate existing images")
    a = ap.parse_args()
    key = os.environ.get("KET_IMAGE_API_KEY")
    if not key:
        raise SystemExit("set KET_IMAGE_API_KEY (and KET_IMAGE_BASE_URL for non-OpenAI providers)")
    base = os.environ.get("KET_IMAGE_BASE_URL", "https://api.openai.com/v1")
    model = os.environ.get("KET_IMAGE_MODEL", "gpt-image-1")
    only = {x for x in a.only.split(",") if x}

    OUT.mkdir(parents=True, exist_ok=True)
    todo = []
    for p in sorted(CONTENT.glob("*.json")):
        for w in json.loads(p.read_text(encoding="utf-8"))["words"]:
            if w.get("scene") and (not only or w["id"] in only):
                if a.force or not (OUT / f"{w['id']}.webp").exists():
                    todo.append(w)
    print(f"{len(todo)} to generate with {model}")
    failed = []
    for w in todo:
        try:
            png = generate(w["scene"], base, key, model)
            img = Image.open(io.BytesIO(png)).convert("RGB").resize((512, 512), Image.LANCZOS)
            img.save(OUT / f"{w['id']}.webp", "WEBP", quality=80, method=6)
            print(f"  ok {w['id']}")
        except Exception as e:
            failed.append(w["id"])
            print(f"  FAIL {w['id']}: {str(e)[:200]}")
    if failed:
        raise SystemExit(f"failed: {','.join(failed)} (rerun with --only)")


if __name__ == "__main__":
    main()

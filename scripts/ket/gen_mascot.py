"""Generate the mascot Max (moods and growth stages) with the same Qwen-Image setup as gen_comfy.py.

Usage:
    python3 scripts/ket/gen_mascot.py [-n 3] [--only happy,cheer]   # candidates -> .local/gen/max-<pose>-<k>.webp
    python3 scripts/ket/gen_mascot.py --pick happy=2,cheer=1         # chosen -> public/media/ui/max-<pose>.webp

Max must look like the puppy in the word pictures, so the pose prompts reuse gen_comfy.CAST["Max"].
"""

from __future__ import annotations

import argparse
import random
import time
from pathlib import Path

import gen_comfy as g

UI = g.ROOT / "public/media/ui"
MAX = g.CAST["Max"]
POSES = {
    # moods, shown next to questions and on the home screen
    "happy": f"{MAX}, sitting and smiling with his tongue out, tail wagging, looking at the viewer.",
    "cheer": f"{MAX}, jumping for joy with both front paws in the air, eyes closed with delight, little gold stars around him.",
    "think": f"{MAX}, sitting with his head tilted, one paw raised, a kind encouraging look, as if saying try again.",
    "sleep": f"{MAX}, curled up asleep on a round cushion, a small crescent moon and stars above him.",
    "wave": f"{MAX}, sitting and waving one front paw hello with a big friendly smile.",
    # growth stages: same puppy, more explorer gear as the child earns stars
    "stage2": f"{MAX}, sitting proudly and wearing a small striped explorer scarf.",
    "stage3": f"{MAX}, sitting proudly with a striped explorer scarf, a little backpack and an explorer hat.",
    "stage4": f"{MAX}, sitting proudly with a striped explorer scarf and a little golden crown, a tiny red cape behind him.",
}
STYLE = (
    "Cute children's picture book illustration, soft gouache and coloured pencil, warm bright cheerful colours, "
    "rounded friendly shapes, the puppy alone, centred and filling most of the frame, plain soft cream background, "
    "no text, no letters, no words."
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("-n", type=int, default=3)
    ap.add_argument("--pick", default="", help="pose=k,... copy chosen candidates into public/media/ui")
    a = ap.parse_args()
    if a.pick:
        UI.mkdir(parents=True, exist_ok=True)
        for item in a.pick.split(","):
            pose, k = item.split("=")
            src = g.GEN / f"max-{pose}-{k}.webp"
            (UI / f"max-{pose}.webp").write_bytes(src.read_bytes())
            print(f"  picked {src.name} -> public/media/ui/max-{pose}.webp")
        return

    only = {x for x in a.only.split(",") if x}
    g.GEN.mkdir(parents=True, exist_ok=True)
    for pose, text in POSES.items():
        if only and pose not in only:
            continue
        for k in range(1, a.n + 1):
            dest = g.GEN / f"max-{pose}-{k}.webp"
            if dest.exists():
                continue
            t = time.time()
            g.to_webp(g.run(g.workflow(f"{text} {STYLE}", random.randrange(2**32))), dest)
            print(f"  max-{pose}-{k} ({time.time() - t:.0f}s)", flush=True)


if __name__ == "__main__":
    main()

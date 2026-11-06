# Does the Three.js path damage the drawing? Compares the raw Pen on a DOM canvas with the same pose through
# Actor + the original cardShade and through Actor + the NPC shading, pixel-aligned, under the bridge's day sun.
# Writes reports/shading-probe.{png,json,md}
# Usage: python tests/visual/shading_probe.py
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from wb_measure import ink_mask, load_rgb, measure, silhouette

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P3 = os.path.join(ROOT, ".local", "p3-white-ball")
STILLS, REPORTS = os.path.join(P3, "stills"), os.path.join(P3, "reports")
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def erode(m, n):
    out = m.copy()
    for _ in range(n):
        e = out.copy()
        e[1:, :] &= out[:-1, :]
        e[:-1, :] &= out[1:, :]
        e[:, 1:] &= out[:, :-1]
        e[:, :-1] &= out[:, 1:]
        out = e
    return out


result, panels = {}, []
for expr in ("default", "anxious"):
    raw, card, npc = (load_rgb(os.path.join(STILLS, f"probe_{expr}_{m}.png")) for m in ("raw", "card", "npc"))
    m = measure(raw)
    ink = ink_mask(raw)
    inside = erode(silhouette(ink) & ~ink, 3)
    cx = m["body"]["cx"]
    xx = np.arange(raw.shape[1])[None, :].repeat(raw.shape[0], 0)
    entry = {}
    for name, im in (("cardShade", card), ("npcShade", npc)):
        d = np.abs(im.astype(np.int16) - raw.astype(np.int16))[inside]
        lum = im.astype(np.float32) @ LUMA
        raw_lum = raw.astype(np.float32) @ LUMA
        left = inside & (xx < cx - 30)
        right = inside & (xx > cx + 30)
        entry[name] = dict(
            meanAbsDiff=round(float(d.mean()), 3), maxDiff=int(d.max()), pixelsOver8=round(float((d.max(axis=1) > 8).mean()), 4),
            lumaShiftLeftHalf=round(float((lum - raw_lum)[left].mean()), 2), lumaShiftRightHalf=round(float((lum - raw_lum)[right].mean()), 2),
        )
    result[expr] = entry
    diff = lambda im: np.clip(np.abs(im.astype(np.int16) - raw.astype(np.int16)).astype(np.int32) * 4, 0, 255).astype(np.uint8)
    panels.append((expr, [raw, card, npc, diff(card), diff(npc)]))

crop = (340, 90, 940, 650)
names = ["RAW PEN (no three.js)", "ACTOR + original cardShade", "ACTOR + NPC shading", "|cardShade - raw| x 4", "|NPC - raw| x 4"]
W, H = crop[2] - crop[0], crop[3] - crop[1]
S = Image.new("RGB", (5 * W, len(panels) * (H + 22)), "white")
d = ImageDraw.Draw(S)
for r, (expr, ims) in enumerate(panels):
    y = r * (H + 22)
    for c, im in enumerate(ims):
        S.paste(Image.fromarray(im).crop(crop), (c * W, y + 22))
        d.text((c * W + 6, y + 5), f"{expr}: {names[c]}", fill="black")
S.save(os.path.join(REPORTS, "shading-probe.png"))
json.dump(result, open(os.path.join(REPORTS, "shading-probe.json"), "w", encoding="utf-8"), indent=1)

md = ["# Shading probe: what the 3D path does to the drawing", "",
      "Same pose, pixel-aligned, white background, the bridge's day sun in the scene. Differences are inside the character, away from every line edge.", "",
      "| expression | shader | mean abs diff from raw (0-255) | max diff | share of pixels over 8 levels | luma shift, left half | luma shift, right half |", "|---|---|---|---|---|---|---|"]
for expr, e in result.items():
    for name, v in e.items():
        md.append(f"| {expr} | {name} | {v['meanAbsDiff']} | {v['maxDiff']} | {v['pixelsOver8']:.1%} | {v['lumaShiftLeftHalf']} | {v['lumaShiftRightHalf']} |")
open(os.path.join(REPORTS, "shading-probe.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
print("\n".join(md))

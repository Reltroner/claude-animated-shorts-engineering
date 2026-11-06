# Measures all 240 original source frames (private, under .local/) into a per-frame table plus a summary. The output is
# what WhiteBallRig.ts constants are derived from, and it checks the provisional expression ranges with a dense sheet.
# Usage: python tests/visual/measure_source.py
import csv, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from wb_measure import load_rgb, measure

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REF = os.path.join(ROOT, ".local", "npc-reference", "white-ball-npc-v1")
OUT = os.path.join(ROOT, ".local", "p3-white-ball", "reports", "source-measure")
os.makedirs(OUT, exist_ok=True)

rows, full = [], {}
for f in range(240):
    m = measure(load_rgb(os.path.join(REF, "frames-png", f"frame_{f:06d}.png")))
    full[f] = m
    row = {"frame": f, "found": m.get("found")}
    if m.get("found"):
        b = m["body"]
        row.update(cx=round(b["cx"], 1), cy=round(b["cy"], 1), rx=round(b["rx"], 1), ry=round(b["ry"], 1), hw=round(m["body_hw"], 3),
                   bottom=round(b["cy"] + b["ry"], 1), bbox_w=m["bbox_w"], bbox_h=m["bbox_h"], ol_top=m["outline_px"]["top"], ol_ul=m["outline_px"]["upLeft"], ol_ur=m["outline_px"]["upRight"],
                   hands=m["hand_count"], lavender=round(m.get("lavender_frac", 0), 3))
        if m["hand_count"] >= 2:
            l, r = m["hands"][0], m["hands"][-1]
            row.update(hLdx=round(l["dx"], 1), hLdy=round(l["dy"], 1), hRdx=round(r["dx"], 1), hRdy=round(r["dy"], 1), hR=round((l["r"] + r["r"]) / 2, 1), hOuter=round(m.get("hand_outer_r", 0), 1))
        if "mouth" in m:
            mm = m["mouth"]
            row.update(mW=mm["w"], mH=mm["h"], mDx=round(mm["dx"], 1), mDy=round(mm["dy"], 1), mR=mm["color"][0], mG=mm["color"][1], mB=mm["color"][2])
        if "shadow" in m:
            s = m["shadow"]
            row.update(sCx=round(s["cx"], 1), sCy=round(s["cy"], 1), sRx=round(s["rx"], 1), sRy=round(s["ry"], 1), sGap=round(s["gap"], 1), sCol=s["color"][0])
        if "drop" in m:
            row.update(dropDx=round(m["drop"]["dx"], 1), dropDy=round(m["drop"]["dy"], 1), dropH=m["drop"]["h"])
    rows.append(row)

keys = []
for r in rows:
    for k in r:
        if k not in keys:
            keys.append(k)
with open(os.path.join(OUT, "per-frame.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=keys)
    w.writeheader()
    w.writerows(rows)
json.dump({str(k): v for k, v in full.items()}, open(os.path.join(OUT, "per-frame-full.json"), "w", encoding="utf-8"))

def med(k, sel=lambda r: True):
    v = [r[k] for r in rows if k in r and r[k] is not None and sel(r)]
    return round(float(np.median(v)), 2) if v else None

print("frames with ball found:", sum(1 for r in rows if r.get("found")))
print("frames with 2 hands found:", sum(1 for r in rows if r.get("hands") == 2))
for k in ("rx", "ry", "hw", "ol_top", "ol_ul", "ol_ur", "hR", "hOuter", "hLdx", "hLdy", "hRdx", "hRdy", "mW", "mH", "mDx", "mDy", "mR", "mG", "mB", "sRx", "sRy", "sGap", "sCol"):
    print(f"median {k}: {med(k)}")

# dense sheet, every 4th frame, frame numbers burned in, so the expression ranges can be read directly
W, H = 213, 120
step = 4
n = 240 // step
cols = 10
S = Image.new("RGB", (cols * W, (n // cols + (n % cols > 0)) * H), "white")
d = ImageDraw.Draw(S)
for i in range(n):
    f = i * step
    im = Image.open(os.path.join(REF, "frames-png", f"frame_{f:06d}.png")).convert("RGB").resize((W, H), Image.LANCZOS)
    x, y = (i % cols) * W, (i // cols) * H
    S.paste(im, (x, y))
    d.rectangle([x, y, x + 28, y + 12], fill="black")
    d.text((x + 2, y + 1), str(f), fill="yellow")
S.save(os.path.join(OUT, "dense-sheet-every4.jpg"), quality=88)
print("wrote", OUT)

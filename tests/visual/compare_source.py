# Seven source-frame vs render comparisons. Both sides go through the same pixel measurement (wb_measure.py), so every
# number in the report is image-to-image. The render is shifted onto the source's body centre before overlap is computed,
# because the source's body sometimes drifts sideways (anxious: 9 px) and that is not what these numbers should grade.
# Writes .local/p3-white-ball/comparisons/*.png and reports/comparison-metrics.{json,md}
# Usage: python tests/visual/compare_source.py
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from wb_measure import ink_mask, label, load_rgb, measure, silhouette

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REF = os.path.join(ROOT, ".local", "npc-reference", "white-ball-npc-v1", "frames-png")
P3 = os.path.join(ROOT, ".local", "p3-white-ball")
STILLS, COMP, REPORTS = os.path.join(P3, "stills"), os.path.join(P3, "comparisons"), os.path.join(P3, "reports")
os.makedirs(COMP, exist_ok=True)
os.makedirs(REPORTS, exist_ok=True)

PAIRS = [("default", 0), ("happy-closed", 47), ("wink", 50), ("surprised", 96), ("tired", 120), ("anxious", 150), ("sparkly-happy", 230)]


def iou(a, b):
    u = (a | b).sum()
    return float((a & b).sum() / u) if u else 0.0


def dilate(m, n):
    out = m.copy()
    for _ in range(n):
        d = out.copy()
        d[1:, :] |= out[:-1, :]
        d[:-1, :] |= out[1:, :]
        d[:, 1:] |= out[:, :-1]
        d[:, :-1] |= out[:, 1:]
        out = d
    return out


def shift(a, dx, dy, fill):
    out = np.full_like(a, fill)
    h, w = a.shape[:2]
    x0, y0 = max(0, dx), max(0, dy)
    x1, y1 = min(w, w + dx), min(h, h + dy)
    out[y0:y1, x0:x1] = a[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
    return out


def face_ink(rgb, m):
    """ink inside the body, without the outline and hands: the face lines"""
    b = m["body"]
    yy, xx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
    inner = np.hypot((xx - b["cx"]) / (b["rx"] - 16), (yy - b["cy"]) / (b["ry"] - 16)) < 1
    for h in m["hands"]:
        inner &= np.hypot(xx - h["cx"], yy - h["cy"]) > h["r"] + 14
    return ink_mask(rgb) & inner, inner


def round2(v):
    if isinstance(v, float):
        return round(v, 2)
    if isinstance(v, list):
        return [round2(x) for x in v]
    if isinstance(v, dict):
        return {k: round2(x) for k, x in v.items()}
    return v


def side_by_side(src, ren, ink_s, ink_r, title, path):
    """source | render | overlay. Overlay: red = source ink only, cyan = render ink only, black = both."""
    h, w = src.shape[:2]
    # tight crop around the character, generous enough for the shadow
    crop = (300, 40, 980, 660)
    overlay = np.full(src.shape, 255, np.uint8)
    overlay[ink_s & ~ink_r] = (230, 40, 40)
    overlay[ink_r & ~ink_s] = (40, 190, 230)
    overlay[ink_s & ink_r] = (0, 0, 0)
    panels = [Image.fromarray(a).crop(crop) for a in (src, ren, overlay)]
    W, H = panels[0].size
    S = Image.new("RGB", (3 * W + 40, H + 44), "white")
    d = ImageDraw.Draw(S)
    d.text((10, 8), title, fill="black")
    for i, name in enumerate(["SOURCE", "RENDER (Pen > Pool > Actor)", "INK OVERLAY  red: source only  cyan: render only  black: both"]):
        S.paste(panels[i], (i * (W + 20), 44))
        d.text((i * (W + 20) + 6, 28), name, fill="#333333")
    S.save(path)


results = {}
md = ["# WB-NPC-001 source vs render comparison", "",
      "Numbers are measured from pixels on both sides by the same code. Human approval is a separate, pending decision.", ""]
md.append("| expression | src frame | silhouette IoU | ink within 3 px | face ink within 3 px | body w/h src | body w/h ren | outline src | outline ren | hands | mean |diff| px, body |")
md.append("|---|---|---|---|---|---|---|---|---|---|---|")
for expr, f in PAIRS:
    src = load_rgb(os.path.join(REF, f"frame_{f:06d}.png"))
    ren_path = os.path.join(STILLS, f"ref_{expr}_src{f:03d}.png")
    ren0 = load_rgb(ren_path)
    ms, mr0 = measure(src), measure(ren0)
    # move the render so body centres coincide; the comparison grades shape, not position in the frame
    dx, dy = int(round(ms["body"]["cx"] - mr0["body"]["cx"])), int(round(ms["body"]["cy"] - mr0["body"]["cy"]))
    ren = shift(ren0, dx, dy, 255)
    mr = measure(ren)

    ink_s, ink_r = ink_mask(src), ink_mask(ren)
    sil_s, sil_r = silhouette(ink_s), silhouette(ink_r)
    fs, _ = face_ink(src, ms)
    fr, _ = face_ink(ren, mr)
    def recall(a, b, n):
        return float((a & dilate(b, n)).sum() / max(1, a.sum()))
    ink3 = (recall(ink_s, ink_r, 3) + recall(ink_r, ink_s, 3)) / 2
    face3 = (recall(fs, fr, 3) + recall(fr, fs, 3)) / 2
    # colour agreement inside both bodies, away from every line
    both = sil_s & sil_r & ~dilate(ink_s | ink_r, 3)
    diff = float(np.abs(src.astype(np.int16) - ren.astype(np.int16))[both].mean())

    hs = [(round(h["dx"], 1), round(h["dy"], 1)) for h in ms["hands"]]
    hr = [(round(h["dx"], 1), round(h["dy"], 1)) for h in mr["hands"]]
    entry = {
        "expression": expr, "sourceFrame": f, "renderShift": [dx, dy],
        "silhouetteIoU": iou(sil_s, sil_r), "ink3px": ink3, "faceInk3px": face3, "bodyColourMeanAbsDiff": diff,
        "source": {k: round2(ms.get(k)) for k in ("body", "body_w", "body_h", "body_hw", "outline_px", "outline_rel", "hand_count", "hand_outer_r", "hand_outline_px", "mouth", "drop", "shadow", "shade", "lavender_frac", "lavender_centroid")},
        "render": {k: round2(mr.get(k)) for k in ("body", "body_w", "body_h", "body_hw", "outline_px", "outline_rel", "hand_count", "hand_outer_r", "hand_outline_px", "mouth", "drop", "shadow", "shade", "lavender_frac", "lavender_centroid")},
        "handsSource": hs, "handsRender": hr,
        "renderBeforeShift": {"body": round2(mr0["body"]), "shadow": round2(mr0.get("shadow"))},
    }
    results[expr] = entry
    title = f"{expr}   source frame {f}   silhouette IoU {entry['silhouetteIoU']:.3f}   ink within 3 px {ink3:.3f}   face ink within 3 px {face3:.3f}"
    side_by_side(src, ren, ink_s, ink_r, title, os.path.join(COMP, f"compare_{expr}.png"))
    md.append(f"| {expr} | {f} | {entry['silhouetteIoU']:.3f} | {ink3:.3f} | {face3:.3f} | {ms['body_hw']:.3f} | {mr['body_hw']:.3f} | {ms['outline_px']['upLeft']} | {mr['outline_px']['upLeft']} | {ms['hand_count']}/{mr['hand_count']} | {diff:.1f} |")

md.append("")
md.append("## Details")
for expr, e in results.items():
    s, r = e["source"], e["render"]
    md.append(f"### {expr} (source frame {e['sourceFrame']})")
    md.append(f"- body outer: source {s['body_w']:.1f} x {s['body_h']:.1f}, render {r['body_w']:.1f} x {r['body_h']:.1f}")
    md.append(f"- outline px (top / upLeft / upRight / bottom): source {list(s['outline_px'].values())}, render {list(r['outline_px'].values())}")
    md.append(f"- hands (dx, dy from body centre): source {e['handsSource']}, render {e['handsRender']}; outer radius source {s.get('hand_outer_r')}, render {r.get('hand_outer_r')}")
    if s.get("mouth") and r.get("mouth"):
        ms_, mr_ = s["mouth"], r["mouth"]
        md.append(f"- pink mouth area: source {ms_['w']} x {ms_['h']} at dy {ms_['dy']}, colour {ms_['color']}; render {mr_['w']} x {mr_['h']} at dy {mr_['dy']}, colour {mr_['color']}")
    elif s.get("mouth") or r.get("mouth"):
        md.append(f"- pink mouth detected: source {bool(s.get('mouth'))}, render {bool(r.get('mouth'))}")
    if s.get("drop") or r.get("drop"):
        md.append(f"- sweat drop: source {s.get('drop')}, render {r.get('drop')}")
    if s.get("shadow") and r.get("shadow"):
        ss, rs = s["shadow"], r["shadow"]
        md.append(f"- floor shadow: source half-width {ss['rx']}, rows {ss['y0']}-{ss['y1']}, grey {ss['color'][0]}; render half-width {rs['rx']}, rows {rs['y0']}-{rs['y1']}, grey {rs['color'][0]}")
    md.append(f"- shade lower-right: source {s['shade']['lowerRight_r90']}, render {r['shade']['lowerRight_r90']}; bottom: source {s['shade']['bottom_r90']}, render {r['shade']['bottom_r90']}; centre: source {s['shade']['center']}, render {r['shade']['center']}; lavender share of the body: source {s['lavender_frac']:.3f}, render {r['lavender_frac']:.3f}")
    md.append("")
json.dump(results, open(os.path.join(REPORTS, "comparison-metrics.json"), "w", encoding="utf-8"), indent=1)
open(os.path.join(REPORTS, "comparison-metrics.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
print("\n".join(md[:13]))

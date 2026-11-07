"""P5 reference audit: measurements and private study montages (numpy + Pillow only).

Reads every JPG under references/ and writes, under .local/p5-white-ball/reference-audit/:
  measure/stills.csv     one row per standalone still
  measure/panels.csv     one row per contact-sheet panel
  measure/sheets.csv     one row per sheet, aggregated from its panels
  image-audit-sheets/    labelled PRIVATE / STUDY ONLY montages

Nothing is written to a tracked folder, and no reference file is modified.

Caption handling: burned-in captions are a white bold word with a thick black outline. They are found in the lower
middle of the frame and masked before any ink statistic, so a caption outline is never counted as a scene outline.
"""
from __future__ import annotations

import csv
import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "references"
OUT = ROOT / ".local" / "p5-white-ball" / "reference-audit"
LABEL = "PRIVATE / STUDY ONLY - NOT FOR PUBLICATION"

HUES = ["red", "orange", "yellow", "chartreuse", "green", "spring", "cyan", "azure", "blue", "violet", "magenta", "rose"]


def luma(a: np.ndarray) -> np.ndarray:
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def hsv(a: np.ndarray):
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    safe = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60
    return h, s, mx


def box3(x: np.ndarray, r: int) -> np.ndarray:
    """Box mean of radius r, using an integral image."""
    pad = np.pad(x, r + 1, mode="edge")
    c = pad.cumsum(0).cumsum(1)
    k = 2 * r + 1
    v = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return v[: x.shape[0], : x.shape[1]] / (k * k)


def dilate(m: np.ndarray, r: int) -> np.ndarray:
    return box3(m.astype(float), r) > 1e-9


def caption_mask(y: np.ndarray, s: np.ndarray) -> tuple[np.ndarray, bool, tuple[int, int] | None]:
    """White bold word with a thick black outline, looked for in the 50-90 % band of the frame height.

    A row counts when near-pure white and near-pure black pixels both appear in it and touch each other. Returns the
    mask, whether a caption was found, and its row span as fractions x 1000 (integers, for the CSV).
    """
    h = y.shape[0]
    white = (y > 0.90) & (s < 0.18)
    black = y < 0.10
    touching = white & dilate(black, 2)
    band = np.zeros_like(white)
    band[int(h * 0.50) : int(h * 0.90)] = True
    rows = (touching & band).sum(1)
    need = max(4, int(y.shape[1] * 0.015))
    idx = np.where(rows >= need)[0]
    if idx.size < max(3, int(h * 0.006)):
        return np.zeros_like(white), False, None
    # keep the run of rows with the most white-on-black contact: one word line, not everything bright in the band
    runs = np.split(idx, np.where(np.diff(idx) > max(2, int(h * 0.004)))[0] + 1)
    run = max(runs, key=lambda r: rows[r].sum())
    a, b = int(run.min()), int(run.max())
    if b - a < max(3, int(h * 0.006)) or b - a > h * 0.14:  # too thin or too tall to be one line of caption text
        return np.zeros_like(white), False, None
    mask = np.zeros_like(white)
    mask[max(0, a - 3) : min(h, b + 4)] = True
    return mask, True, (round(a * 1000 / h), round(b * 1000 / h))


def metrics(a: np.ndarray) -> dict:
    y = luma(a)
    h, s, v = hsv(a)
    cap, found, span = caption_mask(y, s)
    keep = ~cap
    yk = y[keep]
    # ink = thin near-black strokes: darker than the local neighbourhood and dark in absolute terms
    local = box3(y, 3)
    ink = (y < 0.20) & (local - y > 0.10) & keep
    # how much dark pixels the caption would have added if it had not been masked (the reason for the mask)
    cap_black = float(((y < 0.10) & cap).mean())
    gy, gx = np.gradient(y)
    grad = np.hypot(gx, gy)
    # sharpness: the 98th percentile gradient in the top and middle bands, a rough proxy for background blur
    H = y.shape[0]
    top = grad[: int(H * 0.30)]
    mid = grad[int(H * 0.30) : int(H * 0.55)]
    sat_mask = (s > 0.25) & (v > 0.15) & keep
    w = np.histogram(h[sat_mask], bins=12, range=(-15, 345), weights=s[sat_mask])[0] if sat_mask.any() else np.zeros(12)
    # hue bins centred on 0, 30, ...: reds above 345 wrap into bin 0
    if sat_mask.any():
        wrap = h[sat_mask] >= 345
        w[0] += s[sat_mask][wrap].sum()
    hue = HUES[int(np.argmax(w))] if w.sum() > 0 else "neutral"
    # corners against centre
    Y, X = np.mgrid[0:H, 0 : y.shape[1]]
    r = np.hypot((X / y.shape[1] - 0.5) * 2, (Y / H - 0.5) * 2) / np.sqrt(2)
    corner = float(y[(r >= 0.9) & keep].mean()) if ((r >= 0.9) & keep).any() else 0.0
    centre = float(y[(r < 0.3) & keep].mean()) if ((r < 0.3) & keep).any() else 1.0
    # blue-sky share of the top third: saturated blue-ish, smooth, bright
    tt = int(H * 0.33)
    sky = (h[:tt] > 190) & (h[:tt] < 250) & (s[:tt] > 0.22) & (v[:tt] > 0.45) & (grad[:tt] < 0.02)
    return {
        "luma_mean": round(float(yk.mean()), 3),
        "luma_p02": round(float(np.percentile(yk, 2)), 3),
        "luma_p50": round(float(np.percentile(yk, 50)), 3),
        "luma_p98": round(float(np.percentile(yk, 98)), 3),
        "sat_p50": round(float(np.median(s[keep & (v > 0.15)])) if (keep & (v > 0.15)).any() else 0.0, 3),
        "vivid_share": round(float(((s > 0.6) & (v > 0.4) & keep).mean()), 3),
        "dominant_hue": hue,
        "ink_fraction": round(float(ink.mean()), 4),
        "caption_found": int(found),
        "caption_span_permille": f"{span[0]}-{span[1]}" if span else "",
        "caption_black_share": round(cap_black, 4),
        "grad_p98_top": round(float(np.percentile(top, 98)), 4),
        "grad_p98_mid": round(float(np.percentile(mid, 98)), 4),
        "corner_over_centre": round(corner / max(centre, 1e-3), 3),
        "sky_share_top": round(float(sky.mean()), 3),
    }


def load(p: Path) -> np.ndarray:
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255.0


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def grid_of(a: np.ndarray) -> tuple[int, int]:
    """Find the panel grid: panels are vertical 9:16 frames, and seams show where neighbours stop correlating."""
    y = luma(a)
    best = None
    for cols, rows in [(10, 6), (15, 4), (12, 5), (20, 3), (6, 10), (5, 12), (30, 2)]:
        pw, ph = a.shape[1] / cols, a.shape[0] / rows
        if abs(pw - round(pw)) > 1e-6 or abs(ph - round(ph)) > 1e-6 or abs(pw / ph - 9 / 16) > 0.02:
            continue
        dx = np.abs(np.diff(y, axis=1)).mean(0)
        dy = np.abs(np.diff(y, axis=0)).mean(1)
        seam_x = np.mean([dx[int(pw * i) - 1] for i in range(1, cols)]) / max(np.median(dx), 1e-6)
        seam_y = np.mean([dy[int(ph * i) - 1] for i in range(1, rows)]) / max(np.median(dy), 1e-6)
        score = seam_x + seam_y
        if best is None or score > best[0]:
            best = (score, cols, rows)
    assert best is not None
    return best[1], best[2]


def font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def montage(items: list[tuple[str, Image.Image]], cols: int, pw: int, ph: int, title: str, path: Path) -> None:
    rows = (len(items) + cols - 1) // cols
    W, H = cols * pw, rows * (ph + 20) + 30
    sheet = Image.new("RGB", (W, H), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    d.text((6, 6), f"{LABEL}  |  {title}", fill=(255, 210, 90), font=font(15))
    for i, (name, im) in enumerate(items):
        x, y = (i % cols) * pw, 30 + (i // cols) * (ph + 20)
        d.text((x + 4, y + 2), name, fill=(230, 230, 230), font=font(13))
        sheet.paste(im.resize((pw, ph), Image.LANCZOS), (x, y + 20))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, quality=88)


def main() -> int:
    (OUT / "measure").mkdir(parents=True, exist_ok=True)
    frames = sorted((REF / "frames").glob("*.jpg"))
    sheets = sorted((REF / "sheets").glob("*.jpg"))
    print(f"stills {len(frames)} sheets {len(sheets)}")

    rows = []
    for p in frames:
        a = load(p)
        rows.append({"path": p.relative_to(ROOT).as_posix(), "w": a.shape[1], "h": a.shape[0], "bytes": p.stat().st_size,
                     "sha256": sha(p), **metrics(a)})
    with (OUT / "measure" / "stills.csv").open("w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0]))
        wr.writeheader()
        wr.writerows(rows)

    panels, agg = [], []
    grids = set()
    for p in sheets:
        a = load(p)
        cols, rws = grid_of(a)
        grids.add((cols, rws))
        pw, ph = a.shape[1] // cols, a.shape[0] // rws
        prev = None
        cuts = caps = 0
        sheet_rows = []
        for r in range(rws):
            for c in range(cols):
                t = a[r * ph : (r + 1) * ph, c * pw : (c + 1) * pw]
                m = metrics(t)
                if prev is not None:
                    change = float(np.abs(t - prev).mean())
                else:
                    change = 0.0
                prev = t
                row = {"sheet": p.name, "panel": r * cols + c, "row": r, "col": c, "pw": pw, "ph": ph,
                       "change_from_prev": round(change, 4), **m}
                sheet_rows.append(row)
                cuts += change > 0.12
                caps += m["caption_found"]
        panels += sheet_rows
        hues = {}
        for s in sheet_rows:
            hues[s["dominant_hue"]] = hues.get(s["dominant_hue"], 0) + 1
        top = sorted(hues.items(), key=lambda kv: -kv[1])[:3]
        agg.append({
            "path": p.relative_to(ROOT).as_posix(), "w": a.shape[1], "h": a.shape[0], "bytes": p.stat().st_size,
            "sha256": sha(p), "grid": f"{cols}x{rws}", "panels": cols * rws, "panel_w": pw, "panel_h": ph,
            "panels_with_caption": caps, "large_changes": cuts,
            "luma_mean": round(float(np.mean([s["luma_mean"] for s in sheet_rows])), 3),
            "luma_p02_median": round(float(np.median([s["luma_p02"] for s in sheet_rows])), 3),
            "luma_p98_median": round(float(np.median([s["luma_p98"] for s in sheet_rows])), 3),
            "sat_p50_median": round(float(np.median([s["sat_p50"] for s in sheet_rows])), 3),
            "ink_fraction_median": round(float(np.median([s["ink_fraction"] for s in sheet_rows])), 4),
            "panels_dark": sum(s["luma_p50"] < 0.3 for s in sheet_rows),
            "panels_sky": sum(s["sky_share_top"] > 0.25 for s in sheet_rows),
            "top_hues": " ".join(f"{k}:{v}" for k, v in top),
        })
    for name, data in (("panels.csv", panels), ("sheets.csv", agg)):
        with (OUT / "measure" / name).open("w", newline="", encoding="utf-8") as f:
            wr = csv.DictWriter(f, fieldnames=list(data[0]))
            wr.writeheader()
            wr.writerows(data)
    print("grids", grids, "panels", len(panels))

    # montages of the stills, ten per image, large enough to read subject, light and depth
    out = OUT / "image-audit-sheets"
    for i in range(0, len(frames), 10):
        chunk = frames[i : i + 10]
        items = [(p.stem, Image.open(p).convert("RGB")) for p in chunk]
        montage(items, 5, 300, 533, f"standalone stills {i + 1}-{i + len(chunk)} of {len(frames)}", out / f"stills_{i // 10 + 1:02d}.jpg")

    # one labelled copy of each sheet, with its panel numbers drawn on, kept at native panel size
    for p in sheets:
        im = Image.open(p).convert("RGB")
        a = np.asarray(im, dtype=np.float32) / 255.0
        cols, rws = grid_of(a)
        pw, ph = im.width // cols, im.height // rws
        sheet = Image.new("RGB", (im.width, im.height + 28), (20, 20, 24))
        sheet.paste(im, (0, 28))
        d = ImageDraw.Draw(sheet)
        d.text((6, 6), f"{LABEL}  |  {p.name}  |  {cols}x{rws} panels of {pw}x{ph}", fill=(255, 210, 90), font=font(16))
        for r in range(rws):
            for c in range(cols):
                x, y = c * pw + 3, 28 + r * ph + 2
                t = str(r * cols + c)
                d.rectangle([x, y, x + 9 * len(t) + 4, y + 15], fill=(0, 0, 0))
                d.text((x + 2, y), t, fill=(255, 255, 255), font=font(13))
        sheet.save(out / f"sheet_{p.stem}.jpg", quality=88)

    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())

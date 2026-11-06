# Shared image measurement for WB-NPC-001 visual QA. Works the same on an original source frame and on a rendered
# still, so numbers from the two are directly comparable. Dependencies: numpy + Pillow only (no scipy on this machine).
#
# measure(rgb) -> dict with the ball silhouette, body ellipse, hands, eyes, mouth, shading and floor shadow.
# The measurement never looks at code or labels: only at pixels.
import numpy as np
from PIL import Image

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def load_rgb(path):
    return np.asarray(Image.open(path).convert("RGB"), np.uint8)


def label(mask):
    """4-connected components by run-length union-find. Returns (labels, stats); label 0 = not in mask.
    stats[i] = dict(id, area, x0, y0, x1, y1, cx, cy), largest first."""
    h, w = mask.shape
    parent = [0]

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    labels = np.zeros((h, w), np.int32)
    prev = []
    for y in range(h):
        row = mask[y]
        d = np.diff(row.astype(np.int8), prepend=0, append=0)
        starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        cur = []
        pi = 0
        for a, b in zip(starts.tolist(), ends.tolist()):
            lab = 0
            while pi < len(prev) and prev[pi][1] <= a:
                pi += 1
            k = pi
            while k < len(prev) and prev[k][0] < b:
                root = find(prev[k][2])
                if lab == 0:
                    lab = root
                elif root != lab:
                    parent[max(root, lab)] = min(root, lab)
                    lab = min(root, lab)
                k += 1
            if lab == 0:
                lab = len(parent)
                parent.append(lab)
            cur.append((a, b, lab))
            labels[y, a:b] = lab
        prev = cur
    remap = np.zeros(len(parent), np.int32)
    n = 0
    for i in range(1, len(parent)):
        r = find(i)
        if remap[r] == 0:
            n += 1
            remap[r] = n
        remap[i] = remap[r]
    labels = remap[labels]
    stats = []
    if n:
        areas = np.bincount(labels.ravel(), minlength=n + 1)
        ys, xs = np.nonzero(labels)
        ls = labels[ys, xs]
        sx = np.bincount(ls, weights=xs, minlength=n + 1)
        sy = np.bincount(ls, weights=ys, minlength=n + 1)
        x0 = np.full(n + 1, w, np.int64)
        x1 = np.full(n + 1, -1, np.int64)
        y0 = np.full(n + 1, h, np.int64)
        y1 = np.full(n + 1, -1, np.int64)
        np.minimum.at(x0, ls, xs)
        np.maximum.at(x1, ls, xs)
        np.minimum.at(y0, ls, ys)
        np.maximum.at(y1, ls, ys)
        for i in range(1, n + 1):
            stats.append(dict(id=i, area=int(areas[i]), x0=int(x0[i]), y0=int(y0[i]), x1=int(x1[i]), y1=int(y1[i]),
                              cx=float(sx[i] / areas[i]), cy=float(sy[i] / areas[i])))
        stats.sort(key=lambda s: -s["area"])
    return labels, stats


def ink_mask(rgb, thr=80):
    return rgb.max(axis=2) < thr


def silhouette(ink, shadow_excl=None):
    """everything the background flood cannot reach through non-ink pixels = ball + hands, outlines included"""
    lab, stats = label(~ink)
    h, w = ink.shape
    border = set(lab[0, :].tolist()) | set(lab[h - 1, :].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, w - 1].tolist())
    border.discard(0)
    return ~np.isin(lab, list(border))


def fit_ellipse(xs, ys):
    """axis-aligned least squares: x^2 A + y^2 B + x C + y D = 1"""
    x0, y0 = xs.mean(), ys.mean()
    x, y = xs - x0, ys - y0
    M = np.stack([x * x, y * y, x, y], 1)
    A, B, C, D = np.linalg.lstsq(M, np.ones_like(x), rcond=None)[0]
    cx, cy = -C / (2 * A), -D / (2 * B)
    k = 1 + A * cx * cx + B * cy * cy
    return float(cx + x0), float(cy + y0), float(np.sqrt(k / A)), float(np.sqrt(k / B))


def boundary_points(mask):
    m = mask
    er = m.copy()
    er[1:, :] &= m[:-1, :]
    er[:-1, :] &= m[1:, :]
    er[:, 1:] &= m[:, :-1]
    er[:, :-1] &= m[:, 1:]
    return np.nonzero(m & ~er)


def fit_body(sil):
    """Fit the outer body ellipse to the silhouette contour. RANSAC with a fixed seed: hands are outliers wherever they are
    on the contour, including a waving hand in the upper half, where a fit seeded from the top of the shape goes wrong."""
    ys, xs = boundary_points(sil)
    if len(xs) < 50:
        return None
    x, y = xs.astype(np.float64), ys.astype(np.float64)
    rng = np.random.default_rng(20261106)
    best, best_n = None, 0
    for _ in range(500):
        idx = rng.choice(len(x), 8, replace=False)
        try:
            cx, cy, rx, ry = fit_ellipse(x[idx], y[idx])
        except np.linalg.LinAlgError:
            continue
        if not (np.isfinite(rx) and np.isfinite(ry)) or not 0.8 < ry / rx < 1.25 or rx < 20:
            continue
        n = int((np.abs(np.hypot((x - cx) / rx, (y - cy) / ry) - 1) < 0.012).sum())
        if n > best_n:
            best, best_n = (cx, cy, rx, ry), n
    if best is None:
        return None
    cx, cy, rx, ry = best
    for _ in range(6):
        keep = np.abs(np.hypot((x - cx) / rx, (y - cy) / ry) - 1) < 0.012
        if keep.sum() < 50:
            break
        cx, cy, rx, ry = fit_ellipse(x[keep], y[keep])
    return dict(cx=cx, cy=cy, rx=rx, ry=ry, inliers=int(keep.sum()), contour=int(len(x)))


def run_length(mask, x0, y0, dx, dy, steps):
    """length of the first ink run met when walking from (x0, y0) in direction (dx, dy)"""
    h, w = mask.shape
    run, seen = 0, False
    for i in range(steps):
        x, y = int(round(x0 + dx * i)), int(round(y0 + dy * i))
        if not (0 <= x < w and 0 <= y < h):
            break
        if mask[y, x]:
            run += 1
            seen = True
        elif seen:
            break
    return run


def measure(rgb, background_tol=None):
    """All distances are in pixels of this image."""
    out = {"shape": list(rgb.shape[:2])}
    ink = ink_mask(rgb)
    sil = silhouette(ink)
    lab, comps = label(sil)
    if not comps:
        out["found"] = False
        return out
    ball = comps[0]
    sil = lab == ball["id"]
    body = fit_body(sil)
    if body is None:
        out["found"] = False
        return out
    out["found"] = True
    out["bbox"] = [ball["x0"], ball["y0"], ball["x1"], ball["y1"]]
    out["bbox_w"], out["bbox_h"] = ball["x1"] - ball["x0"] + 1, ball["y1"] - ball["y0"] + 1
    out["silhouette_area"] = int(sil.sum())
    out["body"] = body
    cx, cy, rx, ry = body["cx"], body["cy"], body["rx"], body["ry"]
    out["body_w"], out["body_h"], out["body_hw"] = 2 * rx, 2 * ry, ry / rx

    # outline thickness along rays from the centre (top, upper-left, upper-right: never crossed by the hands)
    R = int(max(rx, ry) * 1.25)
    ang = {"top": -90, "upLeft": -135, "upRight": -45, "bottom": 90}
    thick = {}
    for name, deg in ang.items():
        a = np.deg2rad(deg)
        # walk inward from outside so the first ink run met is the outer outline
        sx, sy = cx + np.cos(a) * R, cy + np.sin(a) * R
        thick[name] = run_length(ink, sx, sy, -np.cos(a), -np.sin(a), R)
    out["outline_px"] = thick
    out["outline_rel"] = float(np.median([thick["top"], thick["upLeft"], thick["upRight"]]) / (2 * rx))

    # interior regions (not ink, inside the silhouette): body, hands, eyes, mouth interiors
    inner = sil & ~ink
    ilab, regs = label(inner)
    regs = [r for r in regs if r["area"] >= 25]
    out["regions"] = len(regs)
    hands, face = [], []
    body_reg = regs[0] if regs else None
    for r in regs[1:]:
        dx, dy = (r["cx"] - cx) / rx, (r["cy"] - cy) / ry
        rr = np.hypot(dx, dy)
        w_, h_ = r["x1"] - r["x0"] + 1, r["y1"] - r["y0"] + 1
        aspect = max(w_, h_) / max(1, min(w_, h_))
        fill = r["area"] / max(1, w_ * h_)
        area_rel = r["area"] / (np.pi * rx * ry)
        if rr > 0.62 and aspect < 1.3 and fill > 0.68 and 0.02 < area_rel < 0.14 and abs(dx) > 0.45:
            hands.append(dict(cx=r["cx"], cy=r["cy"], r=float(np.sqrt(r["area"] / np.pi)), dx=float(r["cx"] - cx), dy=float(r["cy"] - cy),
                              x0=r["x0"], y0=r["y0"], x1=r["x1"], y1=r["y1"], area=r["area"]))
        elif rr < 0.95 and r["area"] >= 40:
            face.append(dict(cx=r["cx"], cy=r["cy"], area=r["area"], x0=r["x0"], y0=r["y0"], x1=r["x1"], y1=r["y1"], dx=float(r["cx"] - cx), dy=float(r["cy"] - cy)))
    hands.sort(key=lambda h: h["cx"])
    out["hands"] = hands
    out["hand_count"] = len(hands)
    if len(hands) >= 2:
        # hand outline: walk outward from the hand centre along the side away from the body
        hd = []
        for h in (hands[0], hands[-1]):
            sign = -1 if h is hands[0] else 1
            hd.append(run_length(ink, h["cx"], h["cy"], sign, 0, int(h["r"] * 2.2)))
        out["hand_outline_px"] = hd
        out["hand_outer_r"] = float(np.mean([hands[0]["r"], hands[-1]["r"]]) + np.mean(hd))
        out["hand_outer_r_rel"] = out["hand_outer_r"] / rx
    out["face_regions"] = face

    # pink mouth: warm, not light, not dark, inside the body
    fy, fx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
    r_, g_, b_ = rgb[..., 0].astype(np.int16), rgb[..., 1].astype(np.int16), rgb[..., 2].astype(np.int16)
    pink = sil & (r_ - g_ > 28) & (r_ - b_ > 8) & (r_ > 120)
    plab, ps = label(pink)
    ps = [p for p in ps if p["area"] >= 30]
    if ps:
        m = ps[0]
        mm = plab == m["id"]
        out["mouth"] = dict(x0=m["x0"], y0=m["y0"], x1=m["x1"], y1=m["y1"], w=m["x1"] - m["x0"] + 1, h=m["y1"] - m["y0"] + 1, cx=m["cx"], cy=m["cy"],
                            dx=float(m["cx"] - cx), dy=float(m["cy"] - cy), area=m["area"],
                            color=[int(np.median(rgb[..., c][mm])) for c in range(3)])
    # blue sweat drop
    blue = sil & (b_ - r_ > 40) & (b_ > 150)
    blab, bs = label(blue)
    bs = [p for p in bs if p["area"] >= 30]
    if bs:
        d = bs[0]
        out["drop"] = dict(cx=d["cx"], cy=d["cy"], dx=float(d["cx"] - cx), dy=float(d["cy"] - cy), w=d["x1"] - d["x0"] + 1, h=d["y1"] - d["y0"] + 1, area=d["area"])

    # shading: the colour by normalised position inside the body fill. r = 1 at the outer ellipse.
    if body_reg:
        bm = ilab == body_reg["id"]
        nx, ny = (fx - cx) / rx, (fy - cy) / ry
        nr = np.hypot(nx, ny)
        def med(mask):
            return [int(np.median(rgb[..., c][mask])) for c in range(3)] if mask.sum() > 8 else None
        out["shade"] = {
            "center": med(bm & (nr < 0.12)),
            "upLeft_r85": med(bm & (nr > 0.8) & (nr < 0.9) & (np.abs(np.arctan2(ny, nx) - np.deg2rad(-135)) < 0.2)),
            "lowerRight_r90": med(bm & (nr > 0.86) & (nr < 0.93) & (np.abs(np.arctan2(ny, nx) - np.deg2rad(50)) < 0.2)),
            "bottom_r90": med(bm & (nr > 0.86) & (nr < 0.93) & (np.abs(np.arctan2(ny, nx) - np.deg2rad(90)) < 0.15)),
            "right_r90": med(bm & (nr > 0.86) & (nr < 0.93) & (np.abs(np.arctan2(ny, nx)) < 0.15)),
        }
        # where the crescent starts along the lower-right diagonal: first radius with mean colour noticeably below white
        lum = rgb.astype(np.float32) @ LUMA
        a = np.deg2rad(50)
        prof = []
        for t in np.arange(0.3, 0.96, 0.02):
            x, y = int(round(cx + np.cos(a) * t * rx)), int(round(cy + np.sin(a) * t * ry))
            if bm[y, x]:
                prof.append((round(float(t), 2), float(lum[y, x])))
        out["shade_profile_lr"] = prof
        lav = bm & (lum < 232) & (b_ >= r_ - 4)
        out["lavender_frac"] = float(lav.sum() / max(1, bm.sum()))
        if lav.sum() > 8:
            out["lavender_centroid"] = [float((fx[lav].mean() - cx) / rx), float((fy[lav].mean() - cy) / ry)]

    # floor shadow: neutral mid grey outside the ball (flat on the source)
    mid = ~sil & (rgb.max(axis=2) < 215) & (rgb.min(axis=2) > 110) & (rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16) < 22) & (fy > cy)
    slab, ss = label(mid)
    ss = [s for s in ss if s["area"] >= 400]
    if ss:
        s0 = ss[0]
        mm = slab == s0["id"]
        # the ball covers the top of the ellipse when grounded: take x extent + the lowest row for centre/ry
        rxs = (s0["x1"] - s0["x0"] + 1) / 2
        # widest row = the ellipse's centre row
        widths = mm.sum(axis=1)
        rows = np.flatnonzero(widths >= widths.max() - 1)
        cys = float(rows.mean())
        out["shadow"] = dict(cx=float((s0["x0"] + s0["x1"]) / 2), cy=cys, rx=float(rxs), ry=float(s0["y1"] - cys + 0.5),
                             y0=s0["y0"], y1=s0["y1"], color=[int(np.median(rgb[..., c][mm])) for c in range(3)],
                             gap=float(s0["y1"] - (cy + ry)))
        out["shadow_rx_rel"] = float(rxs / rx)
    # background colour: the median of the corners
    h, w = rgb.shape[:2]
    corners = np.concatenate([rgb[:12, :12].reshape(-1, 3), rgb[:12, -12:].reshape(-1, 3), rgb[-12:, :12].reshape(-1, 3), rgb[-12:, -12:].reshape(-1, 3)])
    out["background"] = [int(v) for v in np.median(corners, axis=0)]
    return out

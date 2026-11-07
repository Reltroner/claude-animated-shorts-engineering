"""P5 video QA, on the final MP4 and the comparison stills. It measures. It cannot judge taste, and it does not claim owner approval.

Gates checked here: TECH, SYNC, NPC, WORLD, PRIVACY (literal content), BASELINE. Writes reports/video-qa.json and the sheets.
Run with any Python that has numpy and Pillow, after the mux step.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from p5_reference_measure import box3, caption_mask, hsv, luma  # noqa: E402

L = ROOT / ".local" / "p5-white-ball"
MP4 = L / "renders" / "WhiteBallArchivePilot.mp4"
REPORTS = L / "reports"
STILLS = L / "stills"
W, H, N, FPS = 1080, 1920, 360, 30
SMALL_W, SMALL_H = 90, 160

checks: list[dict] = []


def check(gate: str, name: str, ok: bool, detail: object = "") -> None:
    checks.append({"gate": gate, "name": name, "pass": bool(ok), "detail": str(detail)})


def font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def run(*a: str) -> subprocess.CompletedProcess:
    return subprocess.run(a, capture_output=True, text=True)


def rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


# ================================================================ technical
def tech() -> dict:
    pr = json.loads(run("ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(MP4)).stdout)
    (REPORTS / "ffprobe-WhiteBallArchivePilot.json").write_text(json.dumps(pr, indent=2) + "\n", encoding="utf-8")
    streams = pr["streams"]
    v = [s for s in streams if s["codec_type"] == "video"]
    a = [s for s in streams if s["codec_type"] == "audio"]
    check("TECH", "exactly one video and one audio stream", len(v) == 1 and len(a) == 1, f"{len(v)} video, {len(a)} audio")
    v, a = v[0], a[0]
    check("TECH", "video is H.264", v["codec_name"] == "h264", v["codec_name"])
    check("TECH", "video is 1080 x 1920", v["width"] == W and v["height"] == H, f'{v["width"]}x{v["height"]}')
    check("TECH", "pixel format is yuv420p", v["pix_fmt"] == "yuv420p", v["pix_fmt"])
    check("TECH", "frame rate is 30/1", v["r_frame_rate"] == "30/1" and v["avg_frame_rate"] == "30/1", f'{v["r_frame_rate"]}, {v["avg_frame_rate"]}')
    check("TECH", "exactly 360 decoded video frames", int(v["nb_read_frames"]) == N, v["nb_read_frames"])
    check("TECH", "video lasts 12.000 s", abs(float(v["duration"]) - 12) < 0.001, v["duration"])
    check("TECH", "audio is AAC", a["codec_name"] == "aac", a["codec_name"])
    check("TECH", "audio is stereo 48 kHz", int(a["channels"]) == 2 and int(a["sample_rate"]) == 48000, f'{a["channels"]} ch, {a["sample_rate"]} Hz')
    check("TECH", "audio lasts 12 s within one AAC frame", abs(float(a["duration"]) - 12) < 2 * 1024 / 48000, a["duration"])
    check("TECH", "container lasts 12 s within codec tolerance", abs(float(pr["format"]["duration"]) - 12) < 0.05, pr["format"]["duration"])
    err = run("ffmpeg", "-v", "error", "-i", str(MP4), "-f", "null", "-").stderr.strip()
    check("TECH", "the file decodes without errors", err == "", err[:200])
    mux = json.loads((REPORTS / "mux.json").read_text(encoding="utf-8"))
    check("TECH", "the mux did not change the video stream", mux["videoStreamBefore"] == mux["videoStreamAfter"], mux["videoStreamAfter"][:40])
    return {"format": pr["format"], "video": v, "audio": a}


# ================================================================ audio inside the MP4
def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        n, ch, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    if sw == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float64) / float(1 << 23)
    else:
        x = np.frombuffer(raw, "<i2").astype(np.float64) / 32768.0
    return x.reshape(-1, ch).T


def audio_in_mp4(tech_info: dict) -> dict:
    tmp = L / "reports" / "_decoded_audio.wav"
    run("ffmpeg", "-y", "-v", "error", "-i", str(MP4), "-map", "0:a:0", "-c:a", "pcm_s24le", str(tmp))
    dec = read_wav(tmp)
    mix = read_wav(L / "audio" / "mix.wav")
    e = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(MP4), "-map", "0:a:0", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-").stderr
    tail = e[e.rfind("Summary:"):]
    I_ = next((float(s.split()[1]) for s in (x.strip() for x in tail.splitlines()) if s.startswith("I:")), float("nan"))
    P_ = next((float(s.split()[1]) for s in (x.strip() for x in tail.splitlines()) if s.startswith("Peak:")), float("nan"))
    sil = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(MP4), "-map", "0:a:0", "-af", "silencedetect=n=-50dB:d=0.25", "-f", "null", "-").stderr
    silences = [ln.split("] ")[-1] for ln in sil.splitlines() if "silence_start" in ln or "silence_end" in ln]
    check("AUDIO", "the MP4's audio is not silent and has no gap of 0.25 s below -50 dB, apart from the final fade", all(float(s.split(": ")[1].split(" ")[0]) > 11.0 for s in silences if "silence_start" in s), silences)
    check("AUDIO", "the MP4's audio measures close to the -18 LUFS target", abs(I_ + 18) <= 1, f"{I_} LUFS")
    check("AUDIO", "the MP4's audio true peak stays at or under -1 dBTP", P_ <= -1.0, f"{P_} dBFS true peak")
    # where does the mix sit inside the decoded AAC? Cross-correlate at the first strong transient region.
    m = mix.mean(0)
    d = dec.mean(0)
    n = min(len(m), len(d), 48000 * 8)
    F = np.fft.rfft(m[:n] * np.hanning(n), 2 * n)
    G = np.fft.rfft(d[:n] * np.hanning(n), 2 * n)
    xc = np.fft.irfft(G * np.conj(F))
    lag = int(np.argmax(xc))
    lag = lag - 2 * n if lag > n else lag
    a_start, v_start = float(tech_info["audio"].get("start_time", 0)), float(tech_info["video"].get("start_time", 0))
    offset_ms = lag / 48 + (a_start - v_start) * 1000
    check("SYNC", "picture and sound start together: offset under one frame", abs(offset_ms) < 1000 / FPS, f"lag {lag} samples, stream starts a {a_start} v {v_start}, offset {offset_ms:.2f} ms")
    k = max(0, lag)
    aligned = d[k:k + len(m)]
    nn = min(len(aligned), len(m))
    corr = float(np.corrcoef(aligned[:nn], m[:nn])[0, 1])
    check("AUDIO", "the audio in the MP4 is the generated mix", corr > 0.98, f"correlation {corr:.4f}")
    tmp.unlink(missing_ok=True)
    return {"integratedLufs": I_, "truePeakDbfs": P_, "silences": silences, "lagSamples": lag, "offsetMs": round(offset_ms, 3), "correlationWithMix": round(corr, 5), "decodedSamples": int(dec.shape[1])}


# ================================================================ walk through every decoded frame
def walk() -> dict:
    per = json.loads((L / "storyboard" / "scenes.json").read_text(encoding="utf-8"))["perFrame"]
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(MP4), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    size = W * H * 3
    small = np.zeros((N, SMALL_H, SMALL_W, 3), np.uint8)
    rows, caption_hits = [], []
    sheet_frames: dict[int, Image.Image] = {}
    for f in range(N):
        raw = proc.stdout.read(size)
        if len(raw) < size:
            raise SystemExit(f"decoded only {f} frames")
        a = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
        im = Image.fromarray(a)
        small[f] = np.asarray(im.resize((SMALL_W, SMALL_H), Image.BOX))
        if f % 12 == 0 or f == N - 1:
            sheet_frames[f] = im.resize((216, 384), Image.LANCZOS)
        p = per[f]
        x0, y0, x1, y1 = p["box"]
        fa = a.astype(np.float32) / 255.0
        y_ = luma(fa)
        h_, s_, v_ = hsv(fa)
        # a caption would be a white word over a black outline. The ball itself is white over black, so its box is blanked first.
        y_c, s_c = y_.copy(), s_.copy()
        if p["visible"]:
            bx0, bx1 = max(0, int(x0 - (x1 - x0) * 0.4)), min(W, int(x1 + (x1 - x0) * 0.4))
            by0, by1 = max(0, int(y0 - (y1 - y0) * 0.6)), min(H, int(y1 + (y1 - y0) * 0.2))
            y_c[by0:by1, bx0:bx1] = 0.5
        _, found, span = caption_mask(y_c, s_c)
        if found:
            caption_hits.append((f, span))
        row = {"f": f, "visible": p["visible"], "luma": float(y_.mean()), "sat": float(np.median(s_)), "lumaP02": float(np.percentile(y_[::4, ::4], 2)), "lumaP98": float(np.percentile(y_[::4, ::4], 98))}
        inside = p["visible"] and f < 346 and x0 > 0 and x1 < W and y0 > 0 and y1 < H
        if inside:
            cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
            # find the body's real edges: near-black outline along unobstructed ellipse rays (lower flanks avoid detached hands and brows)
            ring: dict[str, float] = {}
            flank_dy = 0.75
            flank_dx = float(np.sqrt(1.0 - flank_dy * flank_dy))
            for name, dx, dy in (("left", -flank_dx, flank_dy), ("right", flank_dx, flank_dy), ("top", 0.0, -1.0), ("bottom", 0.0, 1.0)):
                ts = np.arange(0.6, 1.25, 0.004)
                xs = np.clip((cx + dx * ts * rx).astype(int), 0, W - 1)
                ys = np.clip((cy + dy * ts * ry).astype(int), 0, H - 1)
                prof = y_[ys, xs]
                dark = np.where(prof < 0.2)[0]
                ring[name] = float(ts[dark[0]]) if dark.size else float("nan")
            row["ring"] = ring
            def sample(u: float, v: float, rad: int = 4) -> list[float]:
                px, py = int(cx + u * rx), int(cy + v * ry)
                return [float(np.median(fa[py - rad:py + rad + 1, px - rad:px + rad + 1, c])) for c in range(3)]
            row["lit"] = sample(-0.42, -0.5)
            row["crescent"] = sample(0.6, 0.62)
            # share of near-white pixels inside the ball, away from its outline: is the white body really there?
            Y, X = np.ogrid[int(cy - ry * 0.85):int(cy + ry * 0.85), int(cx - rx * 0.85):int(cx + rx * 0.85)]
            mask = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 0.7
            part = fa[int(cy - ry * 0.85):int(cy + ry * 0.85), int(cx - rx * 0.85):int(cx + rx * 0.85)]
            row["whiteShare"] = float((part.min(-1)[mask] > 0.6).mean())
        rows.append(row)
    proc.stdout.close()
    proc.wait()
    return {"small": small, "rows": rows, "captions": caption_hits, "sheet": sheet_frames, "per": per}


def motion_and_npc(w: dict) -> dict:
    small, rows, per = w["small"], w["rows"], w["per"]
    diff = np.abs(np.diff(small.astype(np.int16), axis=0)).mean(axis=(1, 2, 3))
    frozen, start = [], None
    for i, d in enumerate(diff):
        if d < 0.02:
            start = i if start is None else start
        else:
            if start is not None and i - start >= 3:
                frozen.append((start, i))
            start = None
    check("TECH", "no frozen span: every frame differs from the last", not frozen and float(diff.min()) > 0, f"min frame difference {diff.min():.3f}, frozen spans {frozen}")
    bad = [r["f"] for r in rows if r["luma"] < 0.02]
    check("TECH", "no black frame", not bad, bad[:10])
    worlds = small[:, :, :, :].astype(np.float32) / 255.0
    check("WORLD", "the camera really moves: start, middle and end frames are different pictures", np.abs(worlds[0] - worlds[180]).mean() > 0.05 and np.abs(worlds[180] - worlds[345]).mean() > 0.05, f"{np.abs(worlds[0] - worlds[180]).mean():.3f}, {np.abs(worlds[180] - worlds[345]).mean():.3f}")

    # the character's body in the picture against the manifest, on every frame where it is fully in shot
    ring_err = []
    for r in rows:
        if "ring" in r:
            for v in r["ring"].values():
                if np.isfinite(v):
                    ring_err.append(abs(v - 1.0))
    ring_err = np.array(ring_err)
    inside = [r for r in rows if "ring" in r]
    check("NPC", "the ball is where the manifest says on every frame it is fully in shot: outline within 10 % of the predicted radius", len(inside) > 250 and float(np.percentile(ring_err, 95)) < 0.1, f"{len(inside)} frames, median error {np.median(ring_err) * 100:.1f} %, p95 {np.percentile(ring_err, 95) * 100:.1f} % of the radius")
    white = np.array([r["whiteShare"] for r in inside])
    check("NPC", "the white body is present on those frames", float(np.percentile(white, 5)) > 0.55, f"share of light pixels inside the ball: p5 {np.percentile(white, 5):.2f}, median {np.median(white):.2f}")

    # hop timing as drawn: the ball's outline bottom rises in flight and comes back down at the contact frame in the manifest
    cues = json.loads((L / "storyboard" / "audio-cues.json").read_text(encoding="utf-8"))["cues"]
    contact_rows = []
    for c in cues:
        if c["type"] != "hop_contact":
            continue
        f = c["frame"]
        lift_before = per[f - 1]["lift"]
        contact_rows.append({"frame": f, "liftAtContact": per[f]["lift"], "liftFrameBefore": lift_before, "peakLiftBefore": max(p["lift"] for p in per[max(0, f - 16):f])})
    check("SYNC", "each hop contact cue falls on the frame the manifest puts the ball back on the floor", all(r["liftAtContact"] == 0 and r["liftFrameBefore"] > 0 for r in contact_rows), contact_rows)

    # measured: during the last hop, which is fully in shot, the ball's top rises and falls in the decoded frames
    hop = [r for r in rows if 124 <= r["f"] <= 146 and "ring" in r and np.isfinite(r["ring"]["top"])]
    tops = [(r["f"], r["ring"]["top"]) for r in hop]
    return {"diffMin": float(diff.min()), "diffMax": float(diff.max()), "diffMean": float(diff.mean()), "ringErrorMedianPct": float(np.median(ring_err) * 100), "contacts": contact_rows, "topsDuringLastHop": tops, "framesFullyInShot": len(inside)}


def ball_colour(w: dict) -> dict:
    """the ball through the whole post chain, against the raw Pen values measured on the P3 no-post still"""
    rows = [r for r in w["rows"] if "lit" in r]
    lit = np.array([r["lit"] for r in rows]) * 255
    cres = np.array([r["crescent"] for r in rows]) * 255
    raw = STILLS.parent.parent / "p3-white-ball" / "stills" / "probe_default_raw.png"
    rawvals = {}
    if raw.exists():
        a = rgb(raw) * 255
        cx, cy, rx, ry = 640, 366, 230.5, 241.9
        pick = lambda u, v: [float(np.median(a[int(cy + v * ry) - 4:int(cy + v * ry) + 5, int(cx + u * rx) - 4:int(cx + u * rx) + 5, c])) for c in range(3)]
        rawvals = {"lit": pick(-0.42, -0.5), "crescent": pick(0.6, 0.62)}
    med_lit, med_cres = np.median(lit, 0), np.median(cres, 0)
    lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    p5_lit = float(np.percentile(lit @ np.array([0.2126, 0.7152, 0.0722]), 5))
    check("NPC", "the ball stays near-white through the post chain", lum(med_lit) > 225 and p5_lit > 205, f"lit side median RGB {med_lit.round(0).tolist()}, 5th percentile luma {p5_lit:.0f}; raw Pen {rawvals.get('lit')}")
    check("NPC", "the shadow side stays lavender: darker than the lit side, and blue above green", lum(med_cres) < lum(med_lit) - 8 and med_cres[2] > med_cres[1], f"crescent median RGB {med_cres.round(0).tolist()}; raw Pen {rawvals.get('crescent')}")
    return {"litMedianRgb": med_lit.tolist(), "crescentMedianRgb": med_cres.tolist(), "rawPen": rawvals, "litLumaP5": p5_lit}


# ================================================================ post chain and negative controls, on the comparison stills
def edge(a: np.ndarray) -> np.ndarray:
    y = luma(a)
    gy, gx = np.gradient(y)
    return np.hypot(gx, gy)


def post_chain() -> dict:
    out = {}
    per = json.loads((L / "storyboard" / "scenes.json").read_text(encoding="utf-8"))["perFrame"]
    for f in (112, 226, 330):
        name = f"f{f:03d}"
        full = rgb(STILLS / f"post_all_{name}.png")
        row: dict = {}
        for variant in ("no_ink", "no_lens", "no_bloom", "no_grade", "none"):
            row[variant] = round(float(np.abs(rgb(STILLS / f"post_{variant}_{name}.png") - full).mean() * 255), 3)
        x0, y0, x1, y1 = per[f]["box"]
        cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        Y, X = np.ogrid[0:H, 0:W]
        ball = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 0.8
        no_ink = rgb(STILLS / f"post_no_ink_{name}.png")
        row["inkInsideBall"] = round(float(np.abs(no_ink - full)[ball].mean() * 255), 3)
        row["inkOutsideBall"] = round(float(np.abs(no_ink - full)[~ball].mean() * 255), 3)
        dark_on, dark_off = (luma(full) < 0.12)[~ball].mean(), (luma(no_ink) < 0.12)[~ball].mean()
        row["darkShareWithInk"], row["darkShareWithoutInk"] = round(float(dark_on), 4), round(float(dark_off), 4)
        out[name] = row
    for name, r in out.items():
        check("WORLD", f"{name}: the ink pass draws on the world", r["inkOutsideBall"] > 1.0 and r["darkShareWithInk"] > r["darkShareWithoutInk"], f'{r["inkOutsideBall"]} levels outside the ball; dark share {r["darkShareWithInk"]} with, {r["darkShareWithoutInk"]} without')
        check("NPC", f"{name}: no double outline: the world ink changes nothing inside the ball", r["inkInsideBall"] < 0.5, f'{r["inkInsideBall"]} levels inside the ball')
        check("WORLD", f"{name}: the grade changes the picture", r["no_grade"] > 1.0, r["no_grade"])
    check("WORLD", "the lens blur softens the close beat", out["f226"]["no_lens"] > 1.0, out["f226"]["no_lens"])
    check("WORLD", "the lens is off in the reveal, so the constellation stays sharp", out["f330"]["no_lens"] < out["f226"]["no_lens"], f'{out["f330"]["no_lens"]} against {out["f226"]["no_lens"]}')
    check("WORLD", "bloom acts on the bright artifact and the constellation", out["f226"]["no_bloom"] > 0.1 and out["f330"]["no_bloom"] > 0.1, f'{out["f226"]["no_bloom"]}, {out["f330"]["no_bloom"]}')

    # bloom must not touch the ball: its threshold is above anything lit
    f226, nb = rgb(STILLS / "post_all_f226.png"), rgb(STILLS / "post_no_bloom_f226.png")
    x0, y0, x1, y1 = per[226]["box"]
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    Y, X = np.ogrid[0:H, 0:W]
    ball = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 0.8
    glow_on_ball = float(np.abs(f226 - nb)[ball].mean() * 255)
    out["bloomOnBallF226"] = round(glow_on_ball, 3)
    check("NPC", "the ball itself never blooms", glow_on_ball < 1.5, f"{glow_on_ball:.3f} levels inside the ball")

    # negative control: the same frame with the character hidden. The ball's pixels must really come from the character.
    wo = rgb(STILLS / "world_only_f226.png")
    diff_ball = float(np.abs(wo - f226)[ball].mean() * 255)
    diff_far = float(np.abs(wo - f226)[:400].mean() * 255)
    out["worldOnlyControl"] = {"insideBall": round(diff_ball, 2), "topOfFrame": round(diff_far, 3)}
    check("NPC", "negative control: hiding the character removes the ball and leaves the rest of the frame", diff_ball > 40 and diff_far < 1.0, out["worldOnlyControl"])

    # the world alone has depth: near and far blocks differ in sharpness at the close beat, and the world-only frames change with the camera
    e = edge(wo)
    out["worldOnlyEdges"] = {"top": round(float(e[:600].mean()), 5), "bottom": round(float(e[1500:].mean()), 5)}
    frames = [rgb(STILLS / f"world_only_f{f:03d}.png") for f in (0, 112, 226, 330)]
    d = [float(np.abs(frames[i] - frames[i + 1]).mean() * 255) for i in range(3)]
    out["worldOnlyChange"] = [round(v, 1) for v in d]
    check("WORLD", "it is a 3D world, not a flat slideshow: world-only frames differ strongly from one camera to the next", min(d) > 8, d)
    h_, s_, v_ = hsv(rgb(STILLS / "world_only_f112.png"))
    out["worldOnlyColour"] = {"satMedian": round(float(np.median(s_)), 3), "vividShare": round(float(((s_ > 0.5) & (v_ > 0.4)).mean()), 3)}
    check("WORLD", "the world has saturated colour", out["worldOnlyColour"]["satMedian"] > 0.2, out["worldOnlyColour"])
    return out


# ================================================================ nothing literal from the references
def references_similarity(small: np.ndarray) -> dict:
    """every output frame against every still and every sheet panel, masking the caption band in both"""
    refs, names = [], []
    for p in sorted((ROOT / "references" / "frames").glob("*.jpg")):
        refs.append(np.asarray(Image.open(p).convert("L").resize((SMALL_W, SMALL_H), Image.BOX), np.float32))
        names.append(p.name)
    for p in sorted((ROOT / "references" / "sheets").glob("*.jpg")):
        im = Image.open(p).convert("L")
        for r in range(6):
            for c in range(10):
                refs.append(np.asarray(im.crop((c * 180, r * 320, (c + 1) * 180, (r + 1) * 320)).resize((SMALL_W, SMALL_H), Image.BOX), np.float32))
                names.append(f"{p.stem}#{r * 10 + c}")
    R = np.stack(refs)
    O = np.stack([np.asarray(Image.fromarray(s).convert("L"), np.float32) for s in small])
    keep = np.ones(SMALL_H, bool)
    keep[int(SMALL_H * 0.66):int(SMALL_H * 0.76)] = False
    def norm(a: np.ndarray) -> np.ndarray:
        x = a[:, keep].reshape(len(a), -1)
        x = x - x.mean(1, keepdims=True)
        return x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-6)
    Rn, On = norm(R), norm(O)
    score = On @ Rn.T
    i, j = np.unravel_index(int(np.argmax(score)), score.shape)
    best = float(score[i, j])
    # positive controls: would the check catch a real use of reference material?
    #  a reference panel used as a frame, as encoded (a light blur), must score close to 1
    from PIL import ImageFilter
    ctrl_img = Image.fromarray(R[123].astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    ctrl = norm(np.asarray(ctrl_img, np.float32)[None])
    self_score = float((ctrl @ Rn.T).max())
    #  and what unrelated pictures score against each other, from reference panels of a different short
    prefixes = np.array([n[:7] for n in names])
    rr = Rn[38::37] @ Rn.T
    mask = prefixes[38::37][:, None] != prefixes[None, :]
    unrelated = float(np.percentile(rr[mask], 99.9))
    check("PRIVACY", "no output frame resembles a reference image", best < 0.9 and best < self_score - 0.05, f"best match {best:.3f} (frame {i} against {names[j]}); positive control {self_score:.3f}; unrelated reference pairs reach {unrelated:.3f} at the 99.9th percentile")
    return {"bestScore": best, "bestFrame": int(i), "bestReference": names[j], "positiveControl": self_score, "unrelatedP999": unrelated, "referencesCompared": len(names)}


# ================================================================ sheets
def sheets(w: dict) -> None:
    frames = sorted(w["sheet"].items())
    cols, cw, ch = 8, 216, 384
    rows = (len(frames) + cols - 1) // cols
    S = Image.new("RGB", (cols * cw, rows * (ch + 18)), (16, 16, 20))
    d = ImageDraw.Draw(S)
    for k, (f, im) in enumerate(frames):
        x, y = (k % cols) * cw, (k // cols) * (ch + 18)
        d.text((x + 3, y + 2), f"f{f}  {f / FPS:.2f}s", fill=(255, 230, 120), font=font(13))
        S.paste(im, (x, y + 18))
    S.save(REPORTS / "contact-12s.jpg", quality=90)

    def grid(names: list[tuple[str, Path]], out: Path, cols_: int, width: int = 300) -> None:
        h = width * 16 // 9
        r = (len(names) + cols_ - 1) // cols_
        G = Image.new("RGB", (cols_ * width, r * (h + 20)), (16, 16, 20))
        dd = ImageDraw.Draw(G)
        for k, (label, p) in enumerate(names):
            x, y = (k % cols_) * width, (k // cols_) * (h + 20)
            dd.text((x + 3, y + 3), label, fill=(255, 230, 120), font=font(14))
            G.paste(Image.open(p).convert("RGB").resize((width, h), Image.LANCZOS), (x, y + 20))
        G.save(out, quality=90)

    for f in (112, 226, 330):
        n = f"f{f:03d}"
        grid([(lab, STILLS / f"post_{v}_{n}.png") for lab, v in (("all on", "all"), ("no ink", "no_ink"), ("no lens", "no_lens"), ("no bloom", "no_bloom"), ("no grade", "no_grade"), ("no post at all", "none"))], REPORTS / f"post-comparison-{n}.jpg", 6, 260)
    grid([(f"world only f{f}", STILLS / f"world_only_f{f:03d}.png") for f in (0, 112, 226, 330)], REPORTS / "world-only.jpg", 4)
    grid([(p.stem.replace("npc_", ""), p) for p in sorted(STILLS.glob("npc_*.png"))], REPORTS / "npc-expressions.jpg", 5)


# ================================================================ baseline and privacy
def baseline() -> dict:
    protected = ["templates", "references", "SKILL.md", "LICENSE"]
    status = run("git", "-C", str(ROOT), "status", "--porcelain", "--", *protected).stdout
    diff = run("git", "-C", str(ROOT), "diff", "HEAD", "--stat", "--", *protected).stdout
    check("BASELINE", "templates, references, SKILL.md and LICENSE match the commit", status == "" and diff == "", status or diff or "clean")
    p3 = L.parent / "p3-white-ball" / "renders" / "WhiteBallNpcTest.mp4"
    sha = hashlib.sha256(p3.read_bytes()).hexdigest().upper() if p3.exists() else ""
    check("BASELINE", "the P3 proof MP4 is unchanged", sha == "E34A517BA241B7D04FB77D46CE5E18FCA71424CC43A1AF5CB327AC684E09379C", sha)
    n = len(list((L.parent / "npc-reference" / "white-ball-npc-v1" / "frames-png").glob("*.png")))
    check("BASELINE", "the white-ball reference frames are all still there", n == 240, n)
    ignored = lambda p: run("git", "-C", str(ROOT), "check-ignore", "-q", p).returncode == 0
    check("PRIVACY", ".local is ignored by git", all(ignored(p) for p in (".local/p5-white-ball/renders/WhiteBallArchivePilot.mp4", ".local/p5-white-ball/audio/mix.wav", ".local/p5-white-ball/reference-audit/reference-inventory.csv")))
    staged = run("git", "-C", str(ROOT), "diff", "--cached", "--name-only").stdout.strip()
    check("PRIVACY", "nothing is staged", staged == "", staged)
    others = run("git", "-C", str(ROOT), "ls-files", "--others", "--exclude-standard").stdout.split()
    media = [p for p in others if p.lower().endswith((".mp4", ".wav", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".m4a", ".mov"))]
    check("PRIVACY", "no media file could be added by accident", not media, media)
    tracked_media = [p for p in run("git", "-C", str(ROOT), "ls-files").stdout.split() if p.lower().endswith((".mp4", ".wav", ".mp3", ".mov")) or (p.lower().endswith((".png", ".jpg", ".jpeg")) and not p.startswith("references/"))]
    check("PRIVACY", "no render or audio is tracked; the only tracked images are the existing references", not tracked_media, tracked_media)
    head = run("git", "-C", str(ROOT), "rev-parse", "HEAD").stdout.strip()
    upstream = run("git", "-C", str(ROOT), "rev-parse", "origin/feat/white-ball-npc-v2").stdout.strip()
    check("PRIVACY", "nothing was pushed: the remote branch is at the same commit as local HEAD, and local changes are uncommitted", head == upstream, f"HEAD {head[:7]}, origin {upstream[:7]}")
    return {"head": head, "others": others}


def trace_report() -> dict:
    p = REPORTS / "trace-stills.jsonl"
    rows = [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()] if p.exists() else []
    check("NPC", "live browser trace: every drawn character key is WB-NPC-001", bool(rows) and all(r["key"] and r["key"].startswith("WB-NPC-001|") for r in rows), [r["key"][:40] for r in rows if r["key"]][:2])
    check("NPC", "live browser trace: exactly one Actor visible, drawn through the real Pool and a real Pen", all(r["stage"]["actorsVisible"] == 1 and r["stage"]["mapIsPoolCanvasTexture"] and r["stage"]["penInstances"] == r["stage"]["drawCalls"] for r in rows), [r["stage"]["actorsVisible"] for r in rows])
    check("NPC", "live browser trace: the card is on NOINK and the camera can see that layer", all(r["stage"]["actorLayerMask"] == 8 and (r["stage"]["cameraLayerMask"] & 8) for r in rows), rows[0]["stage"]["actorLayerMask"] if rows else "")
    check("WORLD", "live browser trace: no image file is loaded as a texture", all(r["mapImages"] == 0 and r["mapOther"] == 0 and r["mapCanvases"] > 8 for r in rows), {k: rows[0][k] for k in ("mapCanvases", "mapImages", "mapOther", "meshes")} if rows else "")
    names = rows[0]["passes"] if rows else []
    check("WORLD", "live browser trace: the post chain is the bridge's, in order", names[:2] == ["RenderPass", "InkPass"] and sum(n == "EffectPass" for n in names) == 3, names)
    return {"frames": [r["frame"] for r in rows], "gpu": rows[0]["gpu"] if rows else "", "three": rows[0]["three"] if rows else "", "passes": names, "meshes": rows[0]["meshes"] if rows else 0}


def main() -> int:
    REPORTS.mkdir(parents=True, exist_ok=True)
    info = tech()
    aud = audio_in_mp4(info)
    w = walk()
    check("PRIVACY", "no caption-like word anywhere in the output", len(w["captions"]) == 0, w["captions"][:10])
    mot = motion_and_npc(w)
    col = ball_colour(w)
    post = post_chain()
    sim = references_similarity(w["small"])
    base = baseline()
    tr = trace_report()
    sheets(w)
    report = {"checks": checks, "audioInMp4": aud, "motion": mot, "ball": col, "post": post, "similarity": sim, "baseline": {"head": base["head"]}, "trace": tr,
              "perFrame": [{k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items() if k in ("f", "luma", "sat", "lumaP02", "lumaP98")} for r in w["rows"]]}
    (REPORTS / "video-qa.json").write_text(json.dumps(report, indent=1, default=str) + "\n", encoding="utf-8")
    fails = 0
    for gate in ("TECH", "AUDIO", "SYNC", "NPC", "WORLD", "PRIVACY", "BASELINE"):
        sel = [c for c in checks if c["gate"] == gate]
        print(f"--- {gate}: {sum(c['pass'] for c in sel)}/{len(sel)}")
        for c in sel:
            print(("PASS " if c["pass"] else "FAIL ") + c["name"] + (f"  [{c['detail'][:230]}]" if c["detail"] else ""))
            fails += not c["pass"]
    print(f"\n{len(checks) - fails}/{len(checks)} checks passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

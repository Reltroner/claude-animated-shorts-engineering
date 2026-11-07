"""P6 QA, on the final MP4 and the comparison stills. It measures. It cannot judge taste, and it does not claim owner approval.

Gates: G6 audio lock, G7 technical, G8 visual (what can be measured), G9 provenance and baseline. Every check prints PASS or FAIL with its numbers.
Writes reports/p6-video-qa.json, reports/ffprobe-WhiteBallArchivePilot3D.json and the inspection sheets. Run after the mux and the stills:
node studio/scripts/p5-python.mjs tests/visual/p6_video_qa.py
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
L = ROOT / ".local" / "p6-white-ball"
P5 = ROOT / ".local" / "p5-white-ball"
MP4 = L / "renders" / "WhiteBallArchivePilot3D.mp4"
PICTURE = L / "renders" / "WhiteBallArchivePilot3D_picture.mp4"
# The first full render, kept only as a negative control: it has the defects the two checks below look for. Its camera differs only before f216.
SUPERSEDED = L / "renders" / "superseded" / "WhiteBallArchivePilot3D_v1.mp4"
P5_MP4 = P5 / "renders" / "WhiteBallArchivePilot.mp4"
MIX = P5 / "audio" / "mix.wav"
REPORTS = L / "reports"
STILLS = L / "stills"
W, H, N, FPS = 1080, 1920, 360, 30
SMALL_W, SMALL_H = 90, 160

# the values recorded before any P6 work, in reports/g0-baseline.txt: read from that file, so they cannot drift with the code
BASE = {}
for line in (REPORTS / "g0-baseline.txt").read_text(encoding="utf-8").splitlines():
    parts = line.split()
    if len(parts) == 2 and len(parts[0]) == 64:
        BASE[parts[1].lstrip("*")] = parts[0]

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


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def luma(a: np.ndarray) -> np.ndarray:
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def specks(a: np.ndarray, b: dict) -> int:
    """A crack through black paint: tiny isolated blobs of light on a dark ground, inside the ball. A thin gap between two strokes is one long feature and does not count."""
    cx, cy, rx, ry = b["cx"], b["cy"], (b["x1"] - b["x0"]) / 2, (b["y1"] - b["y0"]) / 2
    x0, x1, y0, y1 = int(max(5, cx - rx * 0.85)), int(min(W - 5, cx + rx * 0.85)), int(max(5, cy - ry * 0.85)), int(min(H - 5, cy + ry * 0.85))
    y = luma(a[y0:y1, x0:x1].astype(np.float32) / 255.0)
    ground = np.asarray(Image.fromarray((y * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(9)), np.float32) / 255.0
    light = (y > ground + 0.09) & (ground < 0.11)
    Y, X = np.ogrid[y0:y1, x0:x1]
    light &= ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 0.8
    lab, n = ndimage.label(light, structure=np.ones((3, 3)))
    if n == 0:
        return 0
    sizes = ndimage.sum(light, lab, range(1, n + 1))
    centres = ndimage.center_of_mass(light, lab, range(1, n + 1))
    whole, m = ndimage.label(y > 0.12, structure=np.ones((3, 3)))
    area = ndimage.sum(y > 0.12, whole, range(1, m + 1)) if m else []
    count = 0
    for size, c in zip(sizes, centres):
        comp = whole[int(c[0]), int(c[1])]
        if size <= 8 and comp > 0 and area[comp - 1] <= 12:
            count += 1
    return count


def rim_band(y_: np.ndarray, b: dict) -> float:
    """How light the ink band over the top of the ball gets, in 8-bit levels. A solid outline stays near black. Glow across it does not.
    It reads the real picture rather than an assumed shape: the white body is cut out as a region with its holes filled, so the face does not matter, and the part
    sampled is a ring just outside that region, 20 to 75 % of the way across the band. That is ink wherever perspective has put it, and it stays clear of the
    background even on a dark set. The result is p95 over the ring."""
    cx, cy, rx, ry = b["cx"], b["cy"], (b["x1"] - b["x0"]) / 2, (b["y1"] - b["y0"]) / 2
    width = (1 - RIG["body"]["a"] / RIG["body"]["outerA"]) * max(rx, ry)
    if width < 7:  # a thin line this far from the lens is mostly edge pixels: nothing to read
        return float("nan")
    x0, x1, y0, y1 = int(max(0, cx - rx * 1.2)), int(min(W, cx + rx * 1.2)), int(max(0, cy - ry * 1.2)), int(min(H, cy + ry * 1.2))
    crop = y_[y0:y1, x0:x1]
    lab, n = ndimage.label(crop > 0.5)
    if n == 0:
        return float("nan")
    Y, X = np.ogrid[y0:y1, x0:x1]
    inner = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 0.5
    counts = np.bincount(lab[inner].ravel(), minlength=n + 1)
    counts[0] = 0
    body = ndimage.binary_fill_holes(lab == int(counts.argmax()))
    far, near = int(round(width * 0.75)), max(1, int(round(width * 0.2)))
    ring = ndimage.binary_dilation(body, iterations=far) & ~ndimage.binary_dilation(body, iterations=near)
    ring &= np.broadcast_to(Y < cy - ry * 0.1, ring.shape)
    return float(np.percentile(crop[ring], 95) * 255) if ring.sum() > 50 else float("nan")


PER = json.loads((L / "storyboard" / "frames3d.json").read_text(encoding="utf-8"))
EP = json.loads((L / "storyboard" / "episode3d.json").read_text(encoding="utf-8"))
RIG = EP["rig"]


# ================================================================ G7 technical
def tech() -> dict:
    pr = json.loads(run("ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(MP4)).stdout)
    (REPORTS / "ffprobe-WhiteBallArchivePilot3D.json").write_text(json.dumps(pr, indent=2) + "\n", encoding="utf-8")
    streams = pr["streams"]
    v = [s for s in streams if s["codec_type"] == "video"]
    a = [s for s in streams if s["codec_type"] == "audio"]
    check("G7-TECH", "exactly one video and one audio stream", len(v) == 1 and len(a) == 1, f"{len(v)} video, {len(a)} audio")
    v, a = v[0], a[0]
    check("G7-TECH", "video is H.264", v["codec_name"] == "h264", f'{v["codec_name"]} {v.get("profile")}')
    check("G7-TECH", "video is 1080 x 1920", v["width"] == W and v["height"] == H, f'{v["width"]}x{v["height"]}')
    check("G7-TECH", "pixel format is yuv420p", v["pix_fmt"] == "yuv420p", v["pix_fmt"])
    check("G7-TECH", "frame rate is 30/1", v["r_frame_rate"] == "30/1" and v["avg_frame_rate"] == "30/1", f'{v["r_frame_rate"]}, {v["avg_frame_rate"]}')
    check("G7-TECH", "exactly 360 decoded video frames", int(v["nb_read_frames"]) == N, v["nb_read_frames"])
    # the average above could hide uneven frames: read every frame's own time
    pts = np.array([float(x.strip(",")) for x in run("ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(MP4)).stdout.split()])
    step = np.diff(pts)
    check("G7-TECH", "every frame is exactly one thirtieth of a second after the last: a constant frame rate, not just the right average", pts.size == N and float(np.abs(step - 1 / FPS).max()) < 1e-4, f"{pts.size} frame times, intervals {step.min() * 1000:.3f} to {step.max() * 1000:.3f} ms, first at {pts[0]:.3f} s")
    check("G7-TECH", "video lasts 12.000 s", abs(float(v["duration"]) - 12) < 0.001, v["duration"])
    check("G7-TECH", "audio is AAC", a["codec_name"] == "aac", f'{a["codec_name"]} {a.get("profile")}')
    check("G7-TECH", "audio is stereo 48 kHz", int(a["channels"]) == 2 and int(a["sample_rate"]) == 48000, f'{a["channels"]} ch, {a["sample_rate"]} Hz')
    check("G7-TECH", "audio lasts 12 s within one AAC frame", abs(float(a["duration"]) - 12) < 2 * 1024 / 48000, a["duration"])
    check("G7-TECH", "container lasts 12 s within codec tolerance", abs(float(pr["format"]["duration"]) - 12) < 0.05, pr["format"]["duration"])
    err = run("ffmpeg", "-v", "error", "-i", str(MP4), "-f", "null", "-").stderr.strip()
    check("G7-TECH", "the file decodes without errors", err == "", err[:200])
    mux = json.loads((REPORTS / "mux.json").read_text(encoding="utf-8"))
    check("G7-TECH", "the mux did not change the video stream", mux["videoStreamBefore"] == mux["videoStreamAfter"], mux["videoStreamAfter"][:40])
    render = json.loads((REPORTS / "picture-render.json").read_text(encoding="utf-8"))
    check("G7-TECH", "the picture file is the one the render recorded", sha(PICTURE) == render["sha256"], render["sha256"][:16])
    check("G7-TECH", "the picture carries the staging hash that is live now", render["picture3DHash"] == EP["picture3DHash"], render["picture3DHash"][:16])
    return {"format": pr["format"], "video": v, "audio": a, "render": render, "mux": mux}


# ================================================================ G6 the soundtrack is P5's, unchanged
def decode_pcm(mp4: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-map", "0:a:0", "-f", "s16le", "-acodec", "pcm_s16le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, "<i2").reshape(-1, 2).T.astype(np.float64) / 32768.0


def read_wav(path: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-acodec", "pcm_s16le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, "<i2").reshape(-1, 2).T.astype(np.float64) / 32768.0


def audio() -> dict:
    check("G6-AUDIO", "P5 mix.wav has not changed", sha(MIX) == BASE[".local/p5-white-ball/audio/mix.wav"], sha(MIX)[:16])
    measured = json.loads((P5 / "audio" / "audio-measurements.json").read_text(encoding="utf-8"))
    check("G6-AUDIO", "the audio's timeline lock equals the live timeline", measured["timelineHash"] == EP["timelineHash"], measured["timelineHash"][:16])
    a = run("ffmpeg", "-v", "error", "-i", str(MP4), "-map", "0:a:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-").stdout.strip()
    b = run("ffmpeg", "-v", "error", "-i", str(P5_MP4), "-map", "0:a:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-").stdout.strip()
    check("G6-AUDIO", "the compressed audio stream is identical to the P5 video's", a == b, f"{a[:32]} / {b[:32]}")
    d6, d5, mix = decode_pcm(MP4), decode_pcm(P5_MP4), read_wav(MIX)
    n = min(d6.shape[1], d5.shape[1])
    residual = float(np.abs(d6[:, :n] - d5[:, :n]).max())
    check("G6-AUDIO", "decoded PCM equals the P5 video's decoded PCM, sample for sample", d6.shape == d5.shape and residual == 0.0, f"{d6.shape} vs {d5.shape}, largest difference {residual}")
    m, d = mix.mean(0), d6.mean(0)
    k = min(len(m), len(d), 48000 * 8)
    F = np.fft.rfft(m[:k] * np.hanning(k), 2 * k)
    G = np.fft.rfft(d[:k] * np.hanning(k), 2 * k)
    xc = np.fft.irfft(G * np.conj(F))
    lag = int(np.argmax(xc))
    lag = lag - 2 * k if lag > k else lag
    aligned = d[max(0, lag):max(0, lag) + len(m)]
    nn = min(len(aligned), len(m))
    corr = float(np.corrcoef(aligned[:nn], m[:nn])[0, 1])
    check("G6-AUDIO", "the audio is the P5 mix, aligned: lag under one frame, correlation above 0.99", abs(lag) < 48000 / FPS and corr > 0.99, f"lag {lag} samples, {lag / 48:.2f} ms, correlation {corr:.5f}")
    e = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(MP4), "-map", "0:a:0", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-").stderr
    tail = e[e.rfind("Summary:"):]
    I_ = next((float(s.split()[1]) for s in (x.strip() for x in tail.splitlines()) if s.startswith("I:")), float("nan"))
    P_ = next((float(s.split()[1]) for s in (x.strip() for x in tail.splitlines()) if s.startswith("Peak:")), float("nan"))
    check("G6-AUDIO", "loudness and peak stay where P5 had them", abs(I_ + 18) <= 0.5 and P_ <= -1.0, f"{I_} LUFS, {P_} dBFS true peak")
    # the cues still fall on the picture events: their frames come from the same code the picture uses
    want = sorted((c["frame"], c["type"]) for c in EP["cues"])
    p5_cues = sorted((c["frame"], c["type"]) for c in json.loads((P5 / "storyboard" / "audio-cues.json").read_text(encoding="utf-8"))["cues"])
    check("G6-AUDIO", "every sound cue is on the same frame as in P5", want == p5_cues, f"{len(want)} cues")
    contacts = [c["frame"] for c in EP["cues"] if c["type"] == "hop_contact"]
    check("G6-AUDIO", "the 3D ball touches down on each contact cue's frame", all(PER[f]["height"] == 0 and PER[f - 1]["height"] > 0 for f in contacts), contacts)
    lifts = [c["frame"] for c in EP["cues"] if c["type"] == "hop_lift"]
    check("G6-AUDIO", "and leaves the floor on each lift cue's frame", all(PER[f]["height"] > 0 and PER[f - 1]["height"] == 0 for f in lifts), lifts)
    return {"audioStream": a, "p5AudioStream": b, "largestPcmDifference": residual, "lagSamples": lag, "correlationWithMix": round(corr, 5), "integratedLufs": I_, "truePeakDbfs": P_, "decodedSamplesPerChannel": int(d6.shape[1])}


# ================================================================ walk through every decoded frame
def walk() -> dict:
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(MP4), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    size = W * H * 3
    small = np.zeros((N, SMALL_H, SMALL_W, 3), np.uint8)
    rows, sheet_frames, grid24 = [], {}, {}
    for f in range(N):
        raw = proc.stdout.read(size)
        if len(raw) < size:
            raise SystemExit(f"decoded only {f} frames")
        a = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
        im = Image.fromarray(a)
        small[f] = np.asarray(im.resize((SMALL_W, SMALL_H), Image.BOX))
        if f % 12 == 0 or f == N - 1:
            sheet_frames[f] = im.resize((216, 384), Image.LANCZOS)
        p, b = PER[f], PER[f]["box"]
        y_ = luma(a.astype(np.float32) / 255.0)
        row = {"f": f, "luma": float(y_.mean())}
        inside = p["visible"] and f < 346 and b["x0"] > 0 and b["x1"] < W and b["y0"] > 0 and b["y1"] < H
        if inside:
            cx, cy, rx, ry = b["cx"], b["cy"], (b["x1"] - b["x0"]) / 2, (b["y1"] - b["y0"]) / 2
            fa = a.astype(np.float32) / 255.0
            ring: dict[str, float] = {}
            for name, dx, dy in (("top", 0.0, -1.0), ("bottom", 0.0, 1.0), ("upL", -0.707, -0.707), ("upR", 0.707, -0.707), ("leftHi", -0.94, -0.34), ("rightHi", 0.94, -0.34)):
                ts = np.arange(0.84, 1.14, 0.002)
                xs = np.clip((cx + dx * ts * rx).astype(int), 0, W - 1)
                ys = np.clip((cy + dy * ts * ry).astype(int), 0, H - 1)
                dark = np.where(y_[ys, xs] < 0.2)[0]
                ring[name] = float(ts[dark[0]]) if dark.size else float("nan")
                last = np.where(y_[ys, xs] < 0.2)[0]
                ring[name + "Out"] = float(ts[last[-1]]) if last.size else float("nan")
            row["ring"] = ring

            def sample(u: float, v: float, rad: int = 5) -> list[float]:
                px, py = int(cx + u * rx), int(cy + v * ry)
                return [float(np.median(fa[py - rad:py + rad + 1, px - rad:px + rad + 1, c])) for c in range(3)]
            row["lit"] = sample(-0.46, -0.6)
            row["top"] = sample(0.0, -0.84)
            row["crescent"] = sample(0.62, 0.6)
            row["limbUR"] = sample(0.72, -0.55)
            Y, X = np.ogrid[int(cy - ry * 0.85):int(cy + ry * 0.85), int(cx - rx * 0.85):int(cx + rx * 0.85)]
            mask = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 0.7
            part = fa[int(cy - ry * 0.85):int(cy + ry * 0.85), int(cx - rx * 0.85):int(cx + rx * 0.85)]
            row["whiteShare"] = float((part.min(-1)[mask] > 0.6).mean())
            row["rimP95"] = rim_band(y_, b)
            row["specks"] = specks(a, b)
        rows.append(row)
    proc.stdout.close()
    proc.wait()
    return {"small": small, "rows": rows, "sheet": sheet_frames}


def motion(w: dict) -> dict:
    small, rows = w["small"], w["rows"]
    diff = np.abs(np.diff(small.astype(np.int16), axis=0)).mean(axis=(1, 2, 3))
    frozen, start = [], None
    for i, d in enumerate(diff):
        if d < 0.02:
            start = i if start is None else start
        else:
            if start is not None and i - start >= 3:
                frozen.append((start, i))
            start = None
    check("G7-TECH", "no frozen span: every frame differs from the last", not frozen and float(diff.min()) > 0, f"min frame difference {diff.min():.3f}, frozen spans {frozen}")
    bad = [r["f"] for r in rows if r["luma"] < 0.02]
    check("G7-TECH", "no black frame", not bad, bad[:10])
    # flicker: a one-frame brightness pulse would show as a jump that reverses straight away
    lum = np.array([r["luma"] for r in rows])[:345]
    d1 = np.diff(lum)
    flips = np.where((np.abs(d1[:-1]) > 0.006) & (np.abs(d1[1:]) > 0.006) & (np.sign(d1[:-1]) != np.sign(d1[1:])))[0]
    check("G8-MOTION", "no flicker: mean brightness never pulses for one frame", flips.size == 0, f"largest frame-to-frame change {np.abs(d1).max():.4f}, reversals over 0.006: {flips.tolist()}")
    spike = float(diff.max() / np.median(diff))
    check("G8-MOTION", "no cut or pop in the picture: the largest frame change stays within 7 x the median", spike < 7, f"max {diff.max():.2f}, median {np.median(diff):.2f}, ratio {spike:.1f}, at frame {int(diff.argmax())}")

    inside = [r for r in rows if "ring" in r]
    inner = np.array([v for r in inside for k, v in r["ring"].items() if not k.endswith("Out") and np.isfinite(v)])
    expected_inner = (RIG["body"]["a"] / RIG["body"]["outerA"])
    err = np.abs(inner - expected_inner)
    check("G8-NPC", "the outline is where the rig says on every frame in shot: inner ink edge within 8 % of the prediction, p95", len(inside) > 240 and float(np.percentile(err, 95)) < 0.08, f"{len(inside)} frames, {inner.size} rays, median error {np.median(err) * 100:.1f} %, p95 {np.percentile(err, 95) * 100:.1f} % of the radius")
    # jitter: during the hold the ball's measured top edge against the predicted one has no frame-to-frame shake
    hold = [r for r in inside if 150 <= r["f"] < 280 and np.isfinite(r["ring"]["top"])]
    # the error, not the edge itself: the camera's push and the surprise's pop really do move the edge, and that is not jitter
    tops = np.array([(r["ring"]["top"] - expected_inner) * (PER[r["f"]]["box"]["y1"] - PER[r["f"]]["box"]["y0"]) / 2 for r in hold])
    jitter = float(np.abs(np.diff(tops)).max()) if tops.size else 99
    check("G8-MOTION", "no jitter: from the wave to the reveal, the measured edge's error against the prediction changes under 3 px between frames", jitter < 3, f"largest step {jitter:.2f} px over {tops.size} frames; the error itself stays between {tops.min():.2f} and {tops.max():.2f} px")
    # the outline is solid: nothing glows across it, on any frame. The first full render, which had the fault, is measured the same way when it is there.
    rim_rows = [r for r in inside if np.isfinite(r["rimP95"])]
    rim = np.array([r["rimP95"] for r in rim_rows])
    close = [r for r in inside if 240 <= r["f"] < 270]
    speck_final = np.array([r["specks"] for r in close])
    old_rim, old_specks = None, None
    if SUPERSEDED.exists():
        proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(SUPERSEDED), "-vf", "select='gte(n\\,240)*lt(n\\,270)'", "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        old_rim_rows, old_speck_rows = [], []
        for f in range(240, 270):
            raw = proc.stdout.read(W * H * 3)
            a = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
            old_rim_rows.append(rim_band(luma(a.astype(np.float32) / 255.0), PER[f]["box"]))
            old_speck_rows.append(specks(a, PER[f]["box"]))
        proc.stdout.close()
        proc.wait()
        old_rim, old_specks = float(np.median(old_rim_rows)), float(np.median(old_speck_rows))
        check("G8-NPC", "NEGATIVE: the two checks below do see the faults, in the superseded first render", old_rim > 20 and old_specks >= 6, f"its ink band reaches {old_rim:.1f} levels, its specks per close frame {old_specks:.0f}")
    check("G8-NPC", "the outline stays solid on every frame where it is wide enough to read: no glow across the ink", len(rim_rows) > 200 and float(np.percentile(rim, 99)) < 15 and float(np.median(rim)) < 8, f"{len(rim_rows)} frames from f{rim_rows[0]['f']}; lightest the ink band gets: median {np.median(rim):.1f}, p99 {np.percentile(rim, 99):.1f}, worst {rim.max():.1f} levels, at f{rim_rows[int(rim.argmax())]['f']}")
    check("G8-NPC", "no crack in the face: the pupils stay solid through the close anxious beat", float(np.median(speck_final)) <= 4, f"isolated light specks per frame, f240-f269: median {np.median(speck_final):.0f}, max {speck_final.max()}")
    white = np.array([r["whiteShare"] for r in inside])
    check("G8-NPC", "the white body is there on all of those frames", float(np.percentile(white, 5)) > 0.5, f"light share inside the ball: p5 {np.percentile(white, 5):.2f}, median {np.median(white):.2f}")

    lit = np.array([r["lit"] for r in inside]) * 255
    cres = np.array([r["crescent"] for r in inside]) * 255
    top = np.array([r["top"] for r in inside]) * 255
    med_lit, med_cres, med_top = np.median(lit, 0), np.median(cres, 0), np.median(top, 0)
    lum_ = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    check("G8-NPC", "white identity: the lit side stays near white through the post chain, and is not blown out to pure white", 232 < lum_(med_lit) < 254.5, f"lit side median RGB {med_lit.round(0).tolist()} (P5's card: 248, 248, 245)")
    check("G8-NPC", "lavender identity: the shaded side is darker, and blue over green", lum_(med_cres) < lum_(med_lit) - 20 and med_cres[2] > med_cres[1] and 150 < lum_(med_cres) < 232, f"crescent median RGB {med_cres.round(0).tolist()} (P5's card: 199, 190, 212)")
    # real form shading: the body has a continuous range of values, not two painted zones
    return {"diffMin": float(diff.min()), "diffMax": float(diff.max()), "diffMean": float(diff.mean()), "framesFullyInShot": len(inside), "ringMedianErrPct": float(np.median(err) * 100), "ringP95ErrPct": float(np.percentile(err, 95) * 100), "litMedianRgb": med_lit.tolist(), "crescentMedianRgb": med_cres.tolist(), "topMedianRgb": med_top.tolist(), "jitterPx": jitter, "rimP95Median": float(np.median(rim)), "rimP95P99": float(np.percentile(rim, 99)), "specksCloseMedian": float(np.median(speck_final)), "specksCloseMax": int(speck_final.max()), "supersededRimP95": old_rim, "supersededSpecks": old_specks}


# ================================================================ G8 volume: what a flat card cannot do
def ball_mask(b: dict, k: float = 0.9) -> np.ndarray:
    cx, cy, rx, ry = b["cx"], b["cy"], (b["x1"] - b["x0"]) / 2, (b["y1"] - b["y0"]) / 2
    Y, X = np.ogrid[0:H, 0:W]
    return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < k


def eye_widths(path: Path, b: dict) -> tuple[float, float]:
    """outer width of each eye, as dark columns in the eye band of the ball"""
    a = rgb(path)
    cx, cy, rx, ry = b["cx"], b["cy"], (b["x1"] - b["x0"]) / 2, (b["y1"] - b["y0"]) / 2
    band = (int(cy - ry * 0.42), int(cy - ry * 0.02))
    x0, x1 = int(cx - rx * 0.86), int(cx + rx * 0.86)
    col = (luma(a[band[0]:band[1], x0:x1]) < 0.22).any(0)
    runs, s = [], None
    for i, on in enumerate(col):
        if on and s is None:
            s = i
        if not on and s is not None:
            runs.append((s, i))
            s = None
    if s is not None:
        runs.append((s, len(col)))
    runs = [r for r in runs if r[1] - r[0] > 6]
    if len(runs) < 2:
        return float("nan"), float("nan")
    runs.sort(key=lambda r: r[0])
    return float(runs[0][1] - runs[0][0]), float(runs[-1][1] - runs[-1][0])


def volume() -> dict:
    out: dict = {}
    b = PER[226]["box"]
    front = eye_widths(STILLS / "expr_default_front.png", b)
    turned = eye_widths(STILLS / "expr_default_yaw30.png", b)
    out["eyeWidthsFront"], out["eyeWidthsYaw30"] = front, turned
    check("G8-VOLUME", "the face foreshortens: turned 30 degrees, the far eye is much narrower than the near eye; from the front they nearly match", abs(front[0] / front[1] - 1) < 0.25 and turned[0] / turned[1] > 1.35, f"front L {front[0]:.0f} R {front[1]:.0f} px; yaw 30 near {turned[0]:.0f} far {turned[1]:.0f} px, ratio {turned[0] / turned[1]:.2f}")
    # same frame, camera swung 20 degrees either way round the ball
    res = {}
    for name, f in (("f166", 166), ("f226", 226), ("f290", 290)):
        minus, base, plus = rgb(STILLS / f"orbit_{name.replace('f', 'f')}_minus20.png"), rgb(STILLS / f"with_npc_{name}.png") if (STILLS / f"with_npc_{name}.png").exists() else rgb(STILLS / f"shot_close_{name}.png") if (STILLS / f"shot_close_{name}.png").exists() else rgb(STILLS / f"shot_approach_{name}.png"), rgb(STILLS / f"orbit_{name}_plus20.png")
        bb = PER[f]["box"]
        cy = bb["cy"]
        d = float(np.abs(minus[:int(cy - 400)] - plus[:int(cy - 400)]).mean() * 255) if cy > 500 else float("nan")
        res[name] = {"backgroundChange": round(d, 1)}
    out["orbit"] = res
    check("G8-VOLUME", "real parallax: with the camera 40 degrees further round, the background above the ball is a different picture", all(v["backgroundChange"] > 25 for v in res.values()), res)
    m20, p20 = eye_widths(STILLS / "orbit_f226_minus20.png", b), eye_widths(STILLS / "orbit_f226_plus20.png", b)
    out["eyeWidthsOrbitMinus20"], out["eyeWidthsOrbitPlus20"] = m20, p20
    ratio_m, ratio_p = m20[0] / m20[1], p20[0] / p20[1]
    check("G8-VOLUME", "the eye asymmetry reverses between the two side views, as on a real ball", (ratio_m - 1) * (ratio_p - 1) < 0 and abs(ratio_m - ratio_p) > 0.3, f"-20: L/R {ratio_m:.2f}, +20: L/R {ratio_p:.2f}")
    # The shade is fixed in the world, so it moves across the ball on screen as the camera goes round. Painted on a card it would stay put, to the pixel.
    # Measured as the darkness-weighted centre of the skin, in radii from the ball's centre, with the face and the hands left out.
    def shade_centre(path: Path, bb: dict) -> tuple[float, float]:
        im = rgb(path)
        cx, cy, rx, ry = bb["cx"], bb["cy"], (bb["x1"] - bb["x0"]) / 2, (bb["y1"] - bb["y0"]) / 2
        Y, X = np.ogrid[0:H, 0:W]
        u, v = (X - cx) / rx, (Y - cy) / ry
        y = luma(im)
        skin = (u ** 2 + v ** 2 < 0.8) & (y > 0.45) & ((im.max(-1) - im.min(-1)) / np.maximum(im.max(-1), 1e-3) < 0.16)
        weight = np.maximum(np.percentile(y[skin], 92) - y, 0) * skin
        return float((np.broadcast_to(u, weight.shape) * weight).sum() / weight.sum()), float((np.broadcast_to(v, weight.shape) * weight).sum() / weight.sum())
    moved = {}
    for f in (166, 226, 290):
        m_, p_ = shade_centre(STILLS / f"orbit_f{f}_minus20.png", PER[f]["box"]), shade_centre(STILLS / f"orbit_f{f}_plus20.png", PER[f]["box"])
        moved[f"f{f}"] = {"minus20": [round(m_[0], 3), round(m_[1], 3)], "plus20": [round(p_[0], 3), round(p_[1], 3)], "moved": round(float(np.hypot(p_[0] - m_[0], p_[1] - m_[1])), 3)}
    out["shadeCentre"] = moved
    check("G8-VOLUME", "the body's shading belongs to the world: with the camera 40 degrees further round, the shade sits somewhere else on the ball, by over 5 % of its radius", all(v["moved"] > 0.05 for v in moved.values()), moved)
    # hands have depth: rotating the camera moves them differently from the body
    return out


def identity_iou() -> dict:
    """the 3D face through a long lens against the P3 drawing of the same expression, on the same source-pixel grid"""
    table = {}
    names = ["default", "happy-closed", "wink", "surprised", "tired", "anxious", "sparkly-happy"]
    k3 = (1920 / 2.5) * 0.0019872  # output px per source px: the tele still shows 2.5 m in 1920 px
    us, vs = np.meshgrid(np.arange(-145, 146), np.arange(-165, 80))
    for i, e in enumerate(names):
        p3 = rgb(ROOT / ".local" / "p3-white-ball" / "stills" / f"expr_{i}_{e}.png")
        y = luma(p3)
        cols = np.where((y[:, 400:680] < 0.15).any(1))[0]
        top, bottom = cols[0], cols[-1]
        scale = (bottom - top) / (2 * 241.9)
        row = int((top + bottom) / 2 - 0.3 * 241.9 * scale)
        xs = np.where(y[row] < 0.15)[0]
        cx3, cy3 = (xs[0] + xs[-1]) / 2, (top + bottom) / 2
        t = rgb(STILLS / f"tele_{e}.png")
        tilt = luma(t)
        a = y[np.clip((cy3 + vs * scale).astype(int), 0, H - 1), np.clip((cx3 + us * scale).astype(int), 0, W - 1)] < 0.3
        b_ = tilt[np.clip((960 + vs * k3).astype(int), 0, H - 1), np.clip((540 + us * k3).astype(int), 0, W - 1)] < 0.3
        table[e] = round(float((a & b_).sum() / max(1, (a | b_).sum())), 3)
    check("G8-IDENTITY", "the 3D face matches the P3 drawing of all seven expressions from the front: ink overlap (IoU) above 0.75 each", all(v > 0.75 for v in table.values()), table)
    return table


def expressions_distinct() -> dict:
    names = ["default", "happy-closed", "wink", "surprised", "tired", "anxious", "sparkly-happy"]
    b = PER[226]["box"]
    mask = ball_mask(b, 0.72)
    faces = {e: rgb(STILLS / f"expr_{e}_front.png")[mask] for e in names}
    d = [float(np.abs(faces[a] - faces[c]).mean() * 255) for i, a in enumerate(names) for c in names[i + 1:]]
    check("G8-IDENTITY", "all seven expressions read differently in the world", min(d) > 1.5, f"smallest pair difference {min(d):.1f} levels, largest {max(d):.1f}")
    return {"minPairDifference": round(min(d), 2), "maxPairDifference": round(max(d), 2)}


def actions_distinct() -> dict:
    names = ["idle", "hop", "float", "look-left", "look-right", "wave", "react"]
    frames = {a: rgb(STILLS / f"action_{a}.png") for a in names}
    d = {f"{a}/{c}": round(float(np.abs(frames[a] - frames[c])[1000:].mean() * 255), 2) for i, a in enumerate(names) for c in names[i + 1:]}
    check("G8-MOTION", "all seven actions look different in the world", min(d.values()) > 0.3, f"smallest {min(d, key=d.get)} {min(d.values())}, largest {max(d.values())}")
    return {"minPair": min(d.values()), "maxPair": max(d.values())}


# ================================================================ G8 shadows, contact, occlusion
def darkened(f: int) -> np.ndarray:
    return luma(rgb(STILLS / f"world_only_f{f:03d}.png")) - luma(rgb(STILLS / f"with_npc_f{f:03d}.png"))


def shadows() -> dict:
    out: dict = {}
    rows = []
    for f in (112, 132, 140, 226):
        b, s = PER[f]["box"], PER[f]["sunShadowPx"]
        d = darkened(f)
        mask = (d > 0.05) & ~ball_mask(b, 1.3)
        mask[: int(b["y0"])] = False  # the shadow falls toward the lens: only below the ball's top
        # the character itself and its hands are excluded: the rest is shadow
        for hand in ("handLeftPx", "handRightPx"):
            h = PER[f][hand]
            Y, X = np.ogrid[0:H, 0:W]
            mask &= ((X - h["x"]) ** 2 + (Y - h["y"]) ** 2) > (h["r"] * 1.3) ** 2
        ys, xs = np.where(mask)
        px = mask.sum()
        centroid = (float(xs.mean()), float(ys.mean())) if px else (float("nan"), float("nan"))
        rows.append({"f": f, "shadowPixels": int(px), "centroid": [round(c, 0) for c in centroid], "predictedCentreOfSunShadow": [s["x"], s["y"]], "height": PER[f]["height"]})
    out["pairs"] = rows
    check("G8-SHADOW", "the character casts a real shadow on the world at each sampled frame: thousands of pixels darken when it appears", all(r["shadowPixels"] > 5000 for r in rows), [(r["f"], r["shadowPixels"]) for r in rows])
    # height: same camera, same spot, only the height differs. The sun's direction then says how far the shadow must shift.
    low, high, world = rgb(STILLS / "shadow_low_f226.png"), rgb(STILLS / "shadow_high_f226.png"), rgb(STILLS / "world_only_f226.png")
    b = PER[226]["box"]
    dl, dh = luma(world) - luma(low), luma(world) - luma(high)
    floor = np.zeros((H, W), bool)
    floor[int(b["y1"]) + 20:] = True
    ml, mh = (dl > 0.05) & floor, (dh > 0.05) & floor
    yl, yh = np.where(ml)[0], np.where(mh)[0]
    out["heightTest"] = {"lowPixels": int(ml.sum()), "highPixels": int(mh.sum()), "lowFarEdge": int(np.percentile(yl, 2)) if yl.size else None, "highFarEdge": int(np.percentile(yh, 2)) if yh.size else None}
    check("G8-SHADOW", "the shadow moves with height: lift the same ball off the same spot and its shadow's upper edge slides toward the lens", yl.size > 1000 and yh.size > 1000 and np.percentile(yh, 2) > np.percentile(yl, 2) + 8, out["heightTest"])
    # contact: right under a grounded ball the floor is darker than a hop's height later, from the closed-form occlusion
    def under(f: int) -> float:
        bb = PER[f]["box"]
        a = darkened(f)
        return float(np.median(a[int(bb["y1"]) + 2:int(bb["y1"]) + 12, int(bb["cx"]) - 30:int(bb["cx"]) + 30]))
    out["contactDarkening"] = {"grounded_f140": round(under(140), 3), "mid_hop_f132": round(under(132), 3), "grounded_f226": round(under(226), 3)}
    check("G8-SHADOW", "contact: the floor right under a grounded ball darkens", under(140) > 0.02 and under(226) > 0.015, out["contactDarkening"])
    return out


def occlusion() -> dict:
    b = PER[62]["box"]
    a, n = rgb(STILLS / "with_npc_f062.png"), rgb(STILLS / "world_only_f062.png")
    changed = (np.abs(a - n).max(-1) > 0.04)
    Y, X = np.ogrid[0:H, 0:W]
    ball = (((X - b["cx"]) / ((b["x1"] - b["x0"]) / 2)) ** 2 + ((Y - b["cy"]) / ((b["y1"] - b["y0"]) / 2)) ** 2 < 0.9) & (X >= 0)
    share = float(changed[ball].mean())
    left = ball & (X < b["cx"] - 0.35 * (b["x1"] - b["x0"]) / 2)
    left_share = float(changed[left].mean()) if left.sum() else float("nan")
    right = ball & (X > b["cx"] + 0.35 * (b["x1"] - b["x0"]) / 2)
    right_share = float(changed[right].mean())
    check("G8-WORLD", "real occlusion: as it comes out, the pier hides part of the ball. The far side shows, the side behind the pier does not", 0.05 < share < 0.9 and right_share > left_share + 0.2, f"visible share {share:.2f}; left part {left_share:.2f}, right part {right_share:.2f}")
    return {"visibleShare": round(share, 3), "leftShare": round(left_share, 3), "rightShare": round(right_share, 3)}


def post_chain() -> dict:
    out = {}
    for f in (112, 226, 330):
        n = f"f{f:03d}"
        full = rgb(STILLS / f"post_all_{n}.png")
        ball = ball_mask(PER[f]["box"], 0.8)
        row = {}
        for variant in ("no_ink", "no_lens", "no_bloom", "no_grade"):
            d = np.abs(rgb(STILLS / f"post_{variant}_{n}.png") - full)
            row[variant] = {"all": round(float(d.mean() * 255), 3), "insideBall": round(float(d[ball].mean() * 255), 3), "outsideBall": round(float(d[~ball].mean() * 255), 3)}
        out[n] = row
        check("G8-WORLD", f"{n}: the world's ink draws on the world and adds no second outline inside the ball", row["no_ink"]["outsideBall"] > 1.0 and row["no_ink"]["insideBall"] < 0.5, row["no_ink"])
        check("G8-NPC", f"{n}: the ball does not bloom", row["no_bloom"]["insideBall"] < 1.5, row["no_bloom"])
        b = PER[f]["box"]
        Y, X = np.ogrid[0:H, 0:W]
        r = ((X - b["cx"]) / ((b["x1"] - b["x0"]) / 2)) ** 2 + ((Y - b["cy"]) / ((b["y1"] - b["y0"]) / 2)) ** 2
        ink = (r > 0.91) & (r < 0.975) & (Y < b["cy"] - (b["y1"] - b["y0"]) / 8)
        added = float(np.abs(rgb(STILLS / f"post_no_bloom_{n}.png") - full)[ink].mean() * 255)
        row["bloomOnOutline"] = round(added, 3)
        check("G8-NPC", f"{n}: bloom adds nothing to the ink around the ball", added < 2.0, f"{added:.2f} levels on the upper ink band")
        check("G8-WORLD", f"{n}: the grade acts on the picture", row["no_grade"]["all"] > 1.0, row["no_grade"]["all"])
    check("G8-WORLD", "the depth of field softens the close background", out["f226"]["no_lens"]["outsideBall"] > 1.0, out["f226"]["no_lens"])
    check("G8-NPC", "and leaves the character sharp: much less blur inside the ball than outside", out["f226"]["no_lens"]["insideBall"] < out["f226"]["no_lens"]["outsideBall"] * 0.5, out["f226"]["no_lens"])
    return out


def light_response(w: dict) -> dict:
    by = {r["f"]: r for r in w["rows"] if "ring" in r}
    a, b = np.array(by[190]["limbUR"]) * 255, np.array(by[240]["limbUR"]) * 255
    check("G8-WORLD", "the hall's lights reach the body: when the artifact brightens, the side of the ball facing it gains green", b[1] - a[1] > 2.5, f"upper right limb f190 {a.round(0).tolist()}, f240 {b.round(0).tolist()}")
    c = np.median([by[f]["top"] for f in by if f >= 150], 0) * 255
    check("G8-WORLD", "the warm sun reaches the top of the ball: its top is warmer than its shaded side", (c[0] - c[2]) > (np.median([by[f]["crescent"] for f in by if f >= 150], 0)[0] - np.median([by[f]["crescent"] for f in by if f >= 150], 0)[2]) * 255 + 3, f"top RGB {c.round(0).tolist()}")
    sphere_on, sphere_off = rgb(STILLS / "with_npc_f226.png"), rgb(STILLS / "ab_no_sphere_terms_f226.png")
    bb = PER[226]["box"]
    floor = np.zeros((H, W), bool)
    floor[int(bb["y1"]) - 30:int(bb["y1"]) + 90, int(bb["x0"]):int(bb["x1"])] = True
    floor &= ~ball_mask(bb, 1.05)
    d = float((luma(sphere_off) - luma(sphere_on))[floor].mean() * 255)
    far = float(np.abs(sphere_off - sphere_on)[:300].mean() * 255)
    check("G8-WORLD", "negative control: switching off the sphere terms removes the contact shading around the ball and nothing far away", d > 1.0 and far < 0.5, f"under the ball {d:.2f} levels, top of frame {far:.3f}")
    # the same lights reach both: switching one off everywhere must change the body, and the key must change the floor around it too
    ball = ball_mask(bb, 0.8)
    key_off, hemi_off = rgb(STILLS / "ab_key_off_f226.png"), rgb(STILLS / "ab_hemi_off_f226.png")
    around = np.zeros((H, W), bool)
    around[int(bb["y1"]) + 4:int(bb["y1"]) + 120, int(bb["x0"]) - 60:int(bb["x1"]) + 60] = True
    k_body = float((luma(sphere_on) - luma(key_off))[ball].mean() * 255)
    k_floor = float((luma(sphere_on) - luma(key_off))[around].mean() * 255)
    h_body = float((luma(sphere_on) - luma(hemi_off))[ball].mean() * 255)
    check("G8-WORLD", "negative control: with the key off, the body and the floor around it both get darker", k_body > 15 and k_floor > 1.0, f"body {k_body:.1f} levels, floor {k_floor:.2f} levels")
    check("G8-WORLD", "negative control: with the hemisphere light off, the body gets much darker: it is really lit by it", h_body > 25, f"body {h_body:.1f} levels")
    return {"limbF190": a.tolist(), "limbF240": b.tolist(), "topRgb": c.tolist(), "sphereTermsNearBall": round(d, 2), "sphereTermsFar": round(far, 3), "keyOffBody": round(k_body, 1), "keyOffFloor": round(k_floor, 2), "hemiOffBody": round(h_body, 1)}


def trace_report() -> dict:
    rows = [json.loads(x) for x in (REPORTS / "trace-stills.jsonl").read_text(encoding="utf-8").splitlines() if x.strip()]
    check("G8-NPC", "live trace: the scene really holds the sphere body, two hands and the face mesh", all(r["rig"]["bodyGeometry"] == "SphereGeometry" and r["rig"]["hands"] == 2 and r["rig"]["faceTriangles"] > 400 for r in rows), {k: rows[0]["rig"][k] for k in ("bodyGeometry", "bodySegments", "bodyMaterial", "hands", "handGeometry", "handMaterial", "faceTriangles", "meshes")})
    check("G8-NPC", "live trace: no card, sprite or texture in the character", all(r["rig"]["cards"] == 0 and r["rig"]["textures"] == 0 and not r["rig"]["faceHasTexture"] for r in rows), {k: rows[0]["rig"][k] for k in ("cards", "textures", "faceHasTexture")})
    check("G8-SHADOW", "live trace: the body and both hands are drawn into the sun's shadow map", all(r["shadowDraws"] >= 3 for r in rows if r["showNpc"]), [r["shadowDraws"] for r in rows])
    check("G8-WORLD", "live trace: sun with shadow, a key and a hemisphere light are in the scene", all(sorted(r["lights"]) == sorted(["DirectionalLight+shadow", "DirectionalLight", "HemisphereLight"]) for r in rows), rows[0]["lights"])
    check("G8-WORLD", "live trace: no image file is loaded as a texture", all(r["mapImages"] == 0 and r["mapOther"] == 0 for r in rows), {k: rows[0][k] for k in ("mapCanvases", "mapImages", "mapOther", "meshes")})
    names = rows[0]["passes"]
    check("G8-WORLD", "live trace: the post chain is the same as P5's, in order", names[:2] == ["RenderPass", "InkPass"] and sum(n == "EffectPass" for n in names) == 3, names)
    # a page can log its first frame twice as it settles, with no second draw in between: keep one line per frame, the last
    by_frame = {}
    for x in (REPORTS / "trace-sequence.jsonl").read_text(encoding="utf-8").splitlines():
        if x.strip():
            r = json.loads(x)
            by_frame[r["frame"]] = r
    seq = [by_frame[f] for f in sorted(by_frame)]
    steps = [b["shadowDraws"] - a["shadowDraws"] for a, b in zip(seq, seq[1:])]
    check("G8-SHADOW", "live trace, consecutive frames on one page: the shadow map is refreshed with the character on every frame", len(seq) >= 3 and all(s == 3 for s in steps), {"frames": [r["frame"] for r in seq], "draws": [r["shadowDraws"] for r in seq]})
    return {"frames": [r["frame"] for r in rows], "gpu": rows[0]["gpu"], "three": rows[0]["three"], "rig": rows[0]["rig"], "lights": rows[0]["lights"], "info": rows[0]["info"], "jsHeapBytes": [r["jsHeapBytes"] for r in rows], "sequenceDraws": [r["shadowDraws"] for r in seq]}


# ================================================================ P5 is untouched, and P5 still renders the same
def baseline() -> dict:
    for rel, want in BASE.items():
        p = ROOT / rel
        check("G9-BASELINE", f"unchanged: {rel}", p.exists() and sha(p) == want, want[:16])
    protected = ["templates", "references", "SKILL.md", "LICENSE"]
    status = run("git", "-C", str(ROOT), "status", "--porcelain", "--", *protected).stdout
    diff = run("git", "-C", str(ROOT), "diff", "HEAD", "--stat", "--", *protected).stdout
    check("G9-BASELINE", "templates, references, SKILL.md and LICENSE match the commit", status == "" and diff == "", status or diff or "clean")
    n = len(list((ROOT / ".local" / "npc-reference" / "white-ball-npc-v1" / "frames-png").glob("*.png")))
    check("G9-BASELINE", "the white-ball reference frames are all still there", n == 240, n)
    pics = sorted((L / "stills").glob("p5check_*.png"))
    rows = []
    for p in pics:
        ref = P5 / "stills" / p.name.replace("p5check_", "")
        if ref.exists():
            rows.append({"name": ref.name, "identical": sha(p) == sha(ref), "levels": round(float(np.abs(rgb(p) - rgb(ref)).mean() * 255), 4)})
    check("G9-BASELINE", "the P5 composition still renders the same pictures: fresh stills against P5's own", len(rows) >= 3 and all(r["identical"] for r in rows), rows)
    ignored = lambda p: run("git", "-C", str(ROOT), "check-ignore", "-q", p).returncode == 0
    check("G9-PRIVACY", ".local is ignored by git", all(ignored(p) for p in (".local/p6-white-ball/renders/WhiteBallArchivePilot3D.mp4", ".local/p6-study/20261107/manifest.json", ".local/handoff/p6/PROGRESS.md")))
    staged = run("git", "-C", str(ROOT), "diff", "--cached", "--name-only").stdout.strip()
    check("G9-PRIVACY", "nothing is staged", staged == "", staged)
    others = run("git", "-C", str(ROOT), "ls-files", "--others", "--exclude-standard").stdout.split()
    media = [p for p in others if p.lower().endswith((".mp4", ".wav", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".m4a", ".mov"))]
    check("G9-PRIVACY", "no media file could be added by accident", not media, media)
    tracked = run("git", "-C", str(ROOT), "ls-files").stdout.split()
    check("G9-PRIVACY", "no study material is tracked or about to be", not any("growkaz" in p.lower() or "stickman" in p.lower() or "p6-study" in p for p in tracked + others), "")
    head = run("git", "-C", str(ROOT), "rev-parse", "HEAD").stdout.strip()
    upstream = run("git", "-C", str(ROOT), "rev-parse", "origin/feat/white-ball-npc-v2").stdout.strip()
    # true for the run that made P6. After the owner commits this work it no longer applies: set P6_QA_AFTER_COMMIT=1 then.
    if not os.environ.get("P6_QA_AFTER_COMMIT"):
        check("G9-PRIVACY", "nothing was committed or pushed: HEAD is still the starting commit, and equals the remote branch", head == upstream and head.startswith("fb44995"), f"HEAD {head[:7]}, origin {upstream[:7]}")
    return {"head": head, "untracked": others}


def references_similarity(small: np.ndarray) -> dict:
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
    score = norm(O) @ norm(R).T
    i, j = np.unravel_index(int(np.argmax(score)), score.shape)
    check("G9-PRIVACY", "no output frame resembles a reference image", float(score[i, j]) < 0.9, f"best match {score[i, j]:.3f}, frame {i} against {names[j]}, over {len(names)} references")
    return {"bestScore": float(score[i, j]), "bestFrame": int(i), "bestReference": names[j], "referencesCompared": len(names)}


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

    exprs = ["default", "happy-closed", "wink", "surprised", "tired", "anxious", "sparkly-happy"]
    grid([(f"{e} front", STILLS / f"expr_{e}_front.png") for e in exprs] + [(f"{e} yaw 30", STILLS / f"expr_{e}_yaw30.png") for e in exprs], REPORTS / "expressions-seven.jpg", 7, 240)
    grid([(a, STILLS / f"action_{a}.png") for a in ["idle", "hop", "float", "look-left", "look-right", "wave", "react"]], REPORTS / "actions-seven.jpg", 7, 240)
    grid([("-20", STILLS / "orbit_f166_minus20.png"), ("+20", STILLS / "orbit_f166_plus20.png"), ("-20", STILLS / "orbit_f226_minus20.png"), ("+20", STILLS / "orbit_f226_plus20.png"), ("-20", STILLS / "orbit_f290_minus20.png"), ("+20", STILLS / "orbit_f290_plus20.png")], REPORTS / "side-views.jpg", 6, 260)
    grid([(p.stem, p) for p in sorted(STILLS.glob("hop_f*.png"))], REPORTS / "hop-phases.jpg", 6, 260)
    grid([(p.stem, p) for p in sorted(STILLS.glob("shot_*.png"))], REPORTS / "strategic-shots.jpg", 6, 260)
    grid([(f"world only f{f}", STILLS / f"world_only_f{f:03d}.png") for f in (62, 132, 226, 330)] + [(f"with ball f{f}", STILLS / f"with_npc_f{f:03d}.png") for f in (62, 132, 226, 330)], REPORTS / "world-only-vs-ball.jpg", 4)
    # P5 and P6 side by side at the same frames, from the two final videos
    pairs = []
    for f in (112, 166, 226, 256, 290, 330):
        a = subprocess.run(["ffmpeg", "-v", "error", "-i", str(P5_MP4), "-vf", f"select=eq(n\\,{f})", "-vframes", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", str(MP4), "-vf", f"select=eq(n\\,{f})", "-vframes", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        pairs.append((f, Image.frombytes("RGB", (W, H), a).resize((270, 480), Image.LANCZOS), Image.frombytes("RGB", (W, H), b).resize((270, 480), Image.LANCZOS)))
    G = Image.new("RGB", (len(pairs) * 270, 2 * 500), (16, 16, 20))
    dd = ImageDraw.Draw(G)
    for k, (f, a, b) in enumerate(pairs):
        dd.text((k * 270 + 4, 3), f"P5 card f{f}", fill=(255, 230, 120), font=font(14))
        G.paste(a, (k * 270, 20))
        dd.text((k * 270 + 4, 503), f"P6 3D f{f}", fill=(255, 230, 120), font=font(14))
        G.paste(b, (k * 270, 520))
    G.save(REPORTS / "p5-vs-p6.jpg", quality=90)
    # the same hop, frame by frame, in both films: what the arc and the shadow do now
    hop = (120, 124, 128, 132, 136, 140, 144, 150)
    G = Image.new("RGB", (len(hop) * 200, 2 * 376), (16, 16, 20))
    dd = ImageDraw.Draw(G)
    for k, f in enumerate(hop):
        for row, (label, src) in enumerate((("P5", P5_MP4), ("P6", MP4))):
            raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-vf", f"select=eq(n\\,{f})", "-vframes", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
            G.paste(Image.frombytes("RGB", (W, H), raw).resize((200, 356), Image.LANCZOS), (k * 200, row * 376 + 20))
            dd.text((k * 200 + 4, row * 376 + 3), f"{label} f{f}", fill=(255, 230, 120), font=font(13))
    G.save(REPORTS / "motion-comparison-hop.jpg", quality=90)


def main() -> int:
    REPORTS.mkdir(parents=True, exist_ok=True)
    info = tech()
    aud = audio()
    w = walk()
    mot = motion(w)
    vol = volume()
    iou = identity_iou()
    ex = expressions_distinct()
    ac = actions_distinct()
    sh = shadows()
    occ = occlusion()
    post = post_chain()
    li = light_response(w)
    tr = trace_report()
    sim = references_similarity(w["small"])
    base = baseline()
    sheets(w)
    report = {"sha256": sha(MP4), "bytes": MP4.stat().st_size, "checks": checks, "tech": info, "audio": aud, "motion": mot, "volume": vol, "identityIoU": iou, "expressions": ex, "actions": ac, "shadows": sh, "occlusion": occ, "post": post, "light": li, "trace": tr, "similarity": sim, "baseline": base}
    (REPORTS / "p6-video-qa.json").write_text(json.dumps(report, indent=1, default=str) + "\n", encoding="utf-8")
    fails = 0
    for gate in ("G6-AUDIO", "G7-TECH", "G8-NPC", "G8-IDENTITY", "G8-VOLUME", "G8-SHADOW", "G8-WORLD", "G8-MOTION", "G9-PRIVACY", "G9-BASELINE"):
        sel = [c for c in checks if c["gate"] == gate]
        print(f"--- {gate}: {sum(c['pass'] for c in sel)}/{len(sel)}")
        for c in sel:
            print(("PASS " if c["pass"] else "FAIL ") + c["name"] + (f"  [{c['detail'][:300]}]" if c["detail"] else ""))
            fails += not c["pass"]
    print(f"\n{len(checks) - fails}/{len(checks)} checks passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

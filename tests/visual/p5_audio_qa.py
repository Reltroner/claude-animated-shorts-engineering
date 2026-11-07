"""P5 audio QA on the rendered files. It measures: I cannot hear the result, and this script does not claim to.

Checks: format and exact length, not silent in any second, no clipping, stems sum to the mix, each cue's onset lands within one video
frame of its manifest time, each event rises above the bed around it, pitch content per bar matches the score, and the lock to the
current timeline. Writes reports/audio-qa.json and a waveform and spectrogram sheet with the cues drawn on it.
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "templates" / "audio"))
import dsp  # noqa: E402

A = ROOT / ".local" / "p5-white-ball" / "audio"
STORY = ROOT / ".local" / "p5-white-ball" / "storyboard"
REPORTS = ROOT / ".local" / "p5-white-ball" / "reports"
SR = dsp.SR
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
IMPULSIVE = {"hop_contact", "surprise_pop", "artifact_chime", "release_bell", "node_sparkle"}


def load(name: str) -> tuple[np.ndarray, int]:
    return dsp.read_wav(str(A / f"{name}.wav"))


def envelope(x: np.ndarray, ms: float = 2.0) -> np.ndarray:
    m = np.abs(x).max(0)
    k = max(1, int(SR * ms / 1000))
    return np.convolve(m, np.ones(k) / k, mode="same")


def onset_after(env: np.ndarray, k: int, limit: int) -> int | None:
    """first sample where the envelope climbs a quarter of the way from the level before the cue to the peak after it.
    The search stops at the next cue, so a louder neighbour cannot set the threshold."""
    a, b = max(0, k - int(0.05 * SR)), max(1, k - int(0.005 * SR))
    base = float(np.median(env[a:b])) if b > a else 0.0
    end = min(len(env), k + int(0.25 * SR), limit)
    if end <= k:
        return None
    pk = float(env[k:end].max())
    if pk <= base * 1.2:
        return None
    th = base + 0.25 * (pk - base)
    start = max(0, k - int(0.033 * SR))
    hit = np.where(env[start:end] >= th)[0]
    return int(start + hit[0]) if hit.size else None


def top_pitch_classes(x: np.ndarray, n: int = 6) -> list[str]:
    mono = x.mean(0)
    w = np.hanning(len(mono))
    S = np.abs(np.fft.rfft(mono * w))
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    keep = (f > 70) & (f < 2400)
    midi = 69 + 12 * np.log2(f[keep] / 440.0)
    pc = np.zeros(12)
    np.add.at(pc, np.round(midi).astype(int) % 12, S[keep] ** 2)
    order = np.argsort(pc)[::-1][:n]
    return [NOTES[i] for i in order]


def font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def spectrogram(x: np.ndarray, width: int, height: int) -> np.ndarray:
    mono = x.mean(0)
    nfft = 2048
    hop = max(1, (len(mono) - nfft) // width)
    win = np.hanning(nfft)
    cols = []
    for i in range(width):
        s = np.abs(np.fft.rfft(mono[i * hop: i * hop + nfft] * win)) + 1e-9
        cols.append(s)
    S = 20 * np.log10(np.array(cols).T)
    f = np.fft.rfftfreq(nfft, 1 / SR)
    target = np.geomspace(40, 16000, height)[::-1]
    idx = np.clip(np.searchsorted(f, target), 0, len(f) - 1)
    M = S[idx, :]
    M = np.clip((M - M.max() + 85) / 85, 0, 1)  # 85 dB range below the loudest bin
    return np.stack([np.clip(M * 2.2 - 0.9, 0, 1), np.clip(M * 1.6 - 0.25, 0, 1) * 0.8, np.clip(1.2 - np.abs(M - 0.45) * 2.2, 0, 1) * 0.9], -1)


def sheet(stems: dict[str, np.ndarray], cues: list[dict], scenes: list[dict], fps: int, path: Path) -> None:
    W, ROW, SPEC = 1800, 130, 300
    H = 40 + ROW * 4 + SPEC + 60
    im = Image.new("RGB", (W, H), (16, 16, 22))
    d = ImageDraw.Draw(im)
    d.text((10, 8), "WhiteBallArchivePilot audio: stems, mix, spectrogram of the mix (40 Hz - 16 kHz, log). Green lines are cues, white lines are scene starts.", fill=(230, 230, 230), font=font(16))
    x_of = lambda sec: int(sec / 12.0 * (W - 20)) + 10
    y = 40
    for name in ["stem_music", "stem_sfx", "stem_ambience", "mix"]:
        x = stems[name]
        m = np.abs(x).max(0)
        step = len(m) // (W - 20)
        pk = np.array([m[i * step: (i + 1) * step].max() for i in range(W - 20)])
        pk = pk / max(1e-6, float(pk.max())) if name != "mix" else pk
        for i, v in enumerate(pk):
            h = int(v * (ROW - 26) / 2)
            d.line([(10 + i, y + ROW // 2 - h), (10 + i, y + ROW // 2 + h)], fill=(120, 190, 255) if name != "mix" else (255, 210, 120))
        d.text((12, y + 2), name + (" (scaled to its own peak)" if name != "mix" else " (true scale)"), fill=(230, 230, 230), font=font(13))
        y += ROW
    arr = (spectrogram(stems["mix"], W - 20, SPEC) * 255).astype(np.uint8)
    im.paste(Image.fromarray(arr), (10, y))
    top, bottom = 40, y + SPEC
    for s in scenes:
        xp = x_of(s["start"] / fps)
        d.line([(xp, top), (xp, bottom + 22)], fill=(255, 255, 255))
        d.text((xp + 3, bottom + 4), s["id"], fill=(255, 255, 255), font=font(13))
    for c in cues:
        xp = x_of(c["seconds"])
        d.line([(xp, top), (xp, bottom)], fill=(90, 230, 120))
    for i in range(13):
        d.text((x_of(i), bottom + 24), f"{i}s", fill=(190, 190, 190), font=font(12))
    im.save(path)


def main() -> int:
    manifest = json.loads((STORY / "audio-cues.json").read_text(encoding="utf-8"))
    scenes = json.loads((STORY / "scenes.json").read_text(encoding="utf-8"))["scenes"]
    meas = json.loads((A / "audio-measurements.json").read_text(encoding="utf-8"))
    fps, n = manifest["fps"], manifest["samples"]
    checks: list[tuple[str, bool, str]] = []
    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, bool(ok), str(detail)))

    stems = {}
    for name in ["stem_music", "stem_sfx", "stem_ambience", "mix"]:
        x, sr = load(name)
        stems[name] = x
        check(f"{name} is stereo 48 kHz with exactly {n} samples per channel", sr == SR and x.shape == (2, n), f"sr {sr}, shape {x.shape}")

    mix = stems["mix"]
    check("timeline lock: the audio was made from the current manifest", meas["timelineHash"] == manifest["timelineHash"], meas["timelineHash"][:16])
    check("voice is declared as none", meas["voice"] == "none")

    lufs, tp = dsp.integrated(mix), dsp.true_peak(mix)
    check("integrated loudness is near the -18 LUFS target", abs(lufs + 18) <= 1.0, f"{lufs:.2f} LUFS")
    check("true peak is at most -1 dBTP", tp <= -1.0, f"{tp:.2f} dBTP")
    clipped = int((np.abs(mix) >= 0.999).sum())
    check("no clipped samples", clipped == 0, f"{clipped} samples at full scale")
    dc = float(np.abs(mix.mean(1)).max())
    check("no DC offset", dc < 1e-3, f"{dc:.2e}")

    rms = [float(20 * np.log10(np.sqrt(np.mean(mix[:, dsp.ns(i): dsp.ns(i + 1)] ** 2)) + 1e-12)) for i in range(12)]
    check("no silent second: every second is above -40 dBFS RMS", min(rms) > -40, ", ".join(f"{v:.1f}" for v in rms))
    tail = float(np.abs(mix[:, -int(0.01 * SR):]).max())
    check("quiet tail: the last 10 ms are close to silence", tail < 0.01, f"peak {tail:.5f}")
    corr = float(np.corrcoef(mix[0], mix[1])[0, 1])
    check("stereo is real but mono compatible", 0.2 < corr < 0.995, f"L/R correlation {corr:.3f}")
    summed = stems["stem_music"] + stems["stem_sfx"] + stems["stem_ambience"]
    residual = float(np.sqrt(np.mean((summed - mix) ** 2)) / np.sqrt(np.mean(mix ** 2)))
    check("the three stems add up to the mix", residual < 0.02, f"relative residual {residual:.4f}")

    # ---- each cue against the sound around it
    # a high-passed envelope for the bright events: the camera air and the room tail underneath would hide their onsets
    env_full = envelope(stems["stem_sfx"])
    env_high = envelope(dsp.hp(stems["stem_sfx"], 1500, 2))
    bed_all = stems["stem_music"] + stems["stem_ambience"]
    high_sfx, high_bed = dsp.hp(stems["stem_sfx"], 1500, 2), dsp.hp(bed_all, 1500, 2)
    frame_s = 1 / fps
    rows = []
    cues = manifest["cues"]
    # a swell reaches its loudest long after it starts, so its window has to cover the swell, not only the first moments
    SPAN = {"camera_air": 1.5, "artifact_chime": 1.0, "release_bell": 1.0}
    for i, c in enumerate(cues):
        k = c["sample"]
        later = [o["sample"] for o in cues[i + 1:] if o["sample"] > k + int(0.02 * SR) and o["type"] != "camera_air"]
        limit = later[0] if later else n
        env = env_high if c["type"] in ("node_sparkle", "wave_swish", "hop_lift") else env_full
        on = onset_after(env, k, limit)
        dev_ms = None if on is None else (on - k) / SR * 1000
        a, b = k, min(n, k + int(SPAN.get(c["type"], 0.3) * SR))
        ev, bed = dsp.momentary_max(stems["stem_sfx"][:, a:b]), dsp.momentary_max(bed_all[:, a:b])
        ev_h, bed_h = dsp.momentary_max(high_sfx[:, a:b]), dsp.momentary_max(high_bed[:, a:b])
        rows.append({
            "id": c["id"], "type": c["type"], "frame": c["frame"], "seconds": round(c["seconds"], 3), "onsetDeviationMs": None if dev_ms is None else round(dev_ms, 1),
            "eventLufs": round(float(ev), 1), "bedLufs": round(float(bed), 1), "overBedLu": round(float(ev - bed), 1), "overBedAbove1500HzLu": round(float(ev_h - bed_h), 1),
        })
    for ty in sorted(IMPULSIVE):
        sel = [r for r in rows if r["type"] == ty]
        bad = [r["id"] for r in sel if r["onsetDeviationMs"] is None or abs(r["onsetDeviationMs"]) > frame_s * 1000]
        worst = max((abs(r["onsetDeviationMs"]) for r in sel if r["onsetDeviationMs"] is not None), default=None)
        check(f"{ty}: onset within one frame of the manifest ({len(sel)} cues)", not bad, f"worst {worst} ms; off: {bad}")
    distinct = len({r["type"] for r in rows if r["onsetDeviationMs"] is not None})
    check("at least two distinct event types", distinct >= 2, f"{distinct} types")
    for ty in ("hop_contact", "artifact_chime", "release_bell", "surprise_pop"):
        sel = [r for r in rows if r["type"] == ty]
        check(f"{ty} is level with or above the bed around it", all(r["overBedLu"] > -3 for r in sel), ", ".join(str(r["overBedLu"]) for r in sel))
    # bright, light sounds sit in a different band from the warm pad, so they are judged above 1.5 kHz
    for ty in ("wave_swish", "node_sparkle", "hop_lift"):
        sel = [r for r in rows if r["type"] == ty]
        check(f"{ty} stands above the bed in its own band (above 1.5 kHz)", all(r["overBedAbove1500HzLu"] > 3 for r in sel), ", ".join(str(r["overBedAbove1500HzLu"]) for r in sel))

    # ---- what the music plays, per bar
    bars = []
    for i in range(4):
        seg = stems["stem_music"][:, dsp.ns(i * 3): dsp.ns(i * 3 + 3)]
        bars.append({"bar": i + 1, "scene": scenes[i]["id"], "topPitchClasses": top_pitch_classes(seg), "lufs": round(float(dsp.integrated(seg)), 1)})
    want = [{"D", "A", "E"}, {"E", "G#", "D", "F#", "B"}, {"B", "F#", "D", "F"}, {"D", "F#", "A"}]
    for b, w in zip(bars, want):
        check(f"bar {b['bar']}: the score's chord tones are the strongest pitches", w.issubset(set(b["topPitchClasses"][:6])) or len(w & set(b["topPitchClasses"][:4])) >= 3, f"{b['topPitchClasses']} expected {sorted(w)}")

    # the score is new: no run of 4 melodic intervals in common with the bridge march. Read as text, so the bridge module is not imported.
    tree = ast.parse((ROOT / "templates" / "audio" / "music.py").read_text(encoding="utf-8"))
    theme = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "THEME")
    tree = ast.parse((ROOT / "studio" / "audio" / "archive_pilot_audio.py").read_text(encoding="utf-8"))
    motif = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "MOTIF")
    grams = lambda seq: {tuple(np.diff(seq)[i:i + 4].tolist()) for i in range(len(seq) - 4)}
    bridge_intervals = grams([t[3] for t in theme])
    pilot_intervals = grams([t[2] for t in motif])
    shared = bridge_intervals & pilot_intervals
    check("the melody shares no run of 4 intervals with the bridge march", not shared, f"{len(pilot_intervals)} runs checked against {len(bridge_intervals)}; shared {sorted(shared)}")
    check("the tempo differs from the bridge march", abs(manifest["score"]["bpm"] - 120) > 10, f"{manifest['score']['bpm']} bpm against 120")

    sheet(stems, manifest["cues"], scenes, fps, REPORTS / "audio-cue-summary.png")

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "audio-qa.json").write_text(json.dumps({"checks": [{"name": a, "pass": b, "detail": c} for a, b, c in checks], "cues": rows, "bars": bars, "rmsPerSecond": rms}, indent=2) + "\n", encoding="utf-8")
    fails = 0
    for a, b, c in checks:
        print(("PASS " if b else "FAIL ") + a + (f"  [{c}]" if c else ""))
        fails += not b
    print()
    for r in rows:
        print(f'{r["frame"]:>4} {r["type"]:<15} onset {str(r["onsetDeviationMs"]):>7} ms  event {r["eventLufs"]:>6}  bed {r["bedLufs"]:>6}  over {r["overBedLu"]:>6}  over>1.5k {r["overBedAbove1500HzLu"]:>6}')
    print(f"\n{len(checks) - fails}/{len(checks)} checks passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

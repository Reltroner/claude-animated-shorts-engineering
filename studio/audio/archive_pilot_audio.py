"""Original soundtrack for "The Curious White Ball: Archive of Light". No voice. 12.000 s, 48 kHz, stereo, 24-bit.

Reuses the synthesis and measuring code in templates/audio without changing it:
  dsp.py          sample maths, seeded rng, filters, coloured noise, placement, fades, reverb, BS.1770 loudness, true peak, WAV I/O
  instruments.py  vibes, musicbox, glock, pluck, pad, triangle, timpani
  sfx_gen.py      push_thump, whoosh, breeze, creak, clink

It does NOT import timeline.py, sfx.py, music.py or mix.py. Those hard-code the bridge film's 67.5 s timeline, its march and its
voice stem, so this file has its own timeline (read from the manifest), its own score and its own mix. The limiter here is
written fresh, following the same idea as mix.py: 4x oversampled peak detection, look-ahead, one-pole release.

Every sound comes from a function call and a recorded seed. There are no samples, no voice and nothing taken from a reference.

Run after the manifest step, with the venv that has scipy:
  node --import tsx studio/scripts/emit-p5-manifest.ts
  .local/p5-white-ball/.venv/Scripts/python.exe studio/audio/archive_pilot_audio.py
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "templates" / "audio"))

import dsp  # noqa: E402
from dsp import SR, convolve_st, dbg, fades, hp, integrated, lp, lra, make_ir, momentary, ns, pan, place, rng, short_term, smooth_noise, st, true_peak, tt, widen, write_wav  # noqa: E402
import instruments as I  # noqa: E402
import sfx_gen as G  # noqa: E402

OUT = ROOT / ".local" / "p5-white-ball" / "audio"
STORY = ROOT / ".local" / "p5-white-ball" / "storyboard"
TARGET_LUFS = -18.0
CEIL_DBTP = -1.2  # limiter ceiling, a margin under the -1 dBTP limit


def load_manifest() -> dict:
    p = STORY / "audio-cues.json"
    if not p.exists():
        raise SystemExit("audio-cues.json is missing. Run the manifest step first.")
    m = json.loads(p.read_text(encoding="utf-8"))
    if m["sampleRate"] != SR:
        raise SystemExit(f"manifest sample rate {m['sampleRate']} does not match dsp.SR {SR}")
    if m["samples"] != round(m["frames"] / m["fps"] * SR):
        raise SystemExit("manifest sample count does not match frames / fps")
    return m


def t_of(frame: float, fps: int) -> float:
    """seconds = frame / fps, always"""
    return frame / fps


def exact(x: np.ndarray, n: int) -> np.ndarray:
    """Trim or pad to exactly n samples. A tail cannot drift past the picture."""
    x = st(x)
    if x.shape[1] >= n:
        return x[:, :n]
    return np.pad(x, ((0, 0), (0, n - x.shape[1])))


# ================================================================ score
# D with a raised fourth for the curious first half, a darker turn in bar 3, resolving to plain D major in bar 4.
# 80 bpm: one 4/4 bar is 3.000 s = 90 frames, so each bar is exactly one scene.
BPM = 80.0
BEAT = 60.0 / BPM
D_ROOT = 62  # MIDI D4
BARS = {
    # bar: pad chord (MIDI), bass (MIDI)
    0: ([50, 57, 62, 64, 69], 38),     # Dadd9 with an open fifth
    1: ([52, 56, 62, 66, 71], 40),     # E9 over a held colour: the raised fourth G#
    2: ([47, 54, 59, 62, 65], 35),     # B minor with an added flat third above: the tension
    3: ([50, 57, 62, 66, 69, 74], 38),  # D major: the resolve
}
# the curious figure: a rising fourth that answers itself. (bar, beat, midi, length in beats, velocity)
MOTIF = [
    (0, 1.0, 74, 0.5, 0.52), (0, 1.5, 76, 0.5, 0.46), (0, 2.0, 81, 1.0, 0.56), (0, 3.25, 80, 0.5, 0.36),
    (1, 0.0, 78, 0.5, 0.5), (1, 0.5, 80, 0.5, 0.46), (1, 1.0, 83, 1.0, 0.56), (1, 2.5, 80, 0.5, 0.4), (1, 3.0, 78, 0.5, 0.44), (1, 3.5, 76, 0.5, 0.42),
    (2, 3.0, 77, 0.5, 0.26), (2, 3.5, 76, 0.5, 0.24),
    (3, 0.0, 74, 0.5, 0.5), (3, 0.5, 78, 0.5, 0.5), (3, 1.0, 81, 0.5, 0.54), (3, 1.5, 86, 1.0, 0.62), (3, 2.0, 85, 0.5, 0.42), (3, 2.5, 83, 0.5, 0.44), (3, 3.0, 81, 1.0, 0.5),
]
PLUCKS = [(1, 0.0), (1, 2.0), (3, 0.0), (3, 2.0)]  # warm low plucks that lift bar 2 and carry the resolve


def beat_t(bar: int, beat: float) -> float:
    return (bar * 4 + beat) * BEAT


def render_music(n: int, seeds: dict) -> tuple[np.ndarray, list[dict]]:
    r = rng(seeds["music"])
    rr = lambda: rng(int(r.integers(1 << 30)))
    pads = np.zeros((2, n))
    keys = np.zeros((2, n))
    low = np.zeros((2, n))
    events: list[dict] = []
    F = I.m2f

    for bar, (chord, bass) in BARS.items():
        t0 = beat_t(bar, 0)
        vel = {0: 0.34, 1: 0.4, 2: 0.42, 3: 0.5}[bar]
        warm = {0: 760.0, 1: 880.0, 2: 620.0, 3: 1250.0}[bar]
        x = I.pad([F(m) for m in chord], 3.0 + (0.5 if bar == 3 else 0.0), vel, rr(), att=0.55 if bar else 1.0, rel=1.1, warm=warm, detune=6.0)
        place(pads, x, t0)
        events.append({"t": round(t0, 3), "what": f"pad bar {bar + 1}", "midi": chord})
        # a soft low bass under each bar, as an unpitched-looking swell rather than a march beat
        place(low, pan(I.brass(F(bass + 12), 2.4, 0.2, rr(), "soft", scoop=-4), -0.05), t0 + 0.02)

    for bar, beat, midi, length, vel in MOTIF:
        t = beat_t(bar, beat)
        if bar == 3:
            x = I.musicbox(F(midi), vel, rr(), dur=2.0)
            p = 0.18
        else:
            x = I.vibes(F(midi), vel, rr(), dur=max(1.4, length * BEAT + 0.9), damp=length * BEAT + 0.4, trem_depth=0.14)
            p = -0.16
        place(keys, pan(x, p), t)
        events.append({"t": round(t, 3), "what": "motif", "midi": midi})

    for bar, beat in PLUCKS:
        place(low, pan(I.pluck(F(BARS[bar][1] + 12), 0.62, rr(), dur=1.1, bright=0.35), -0.08), beat_t(bar, beat))

    # bar 3: a soft timpani swell and a held high tone under the anxious beat. It stays tonal: no hit, no explosive impact.
    place(low, pan(I.timpani(F(35), 0.2, rr(), dur=2.0), 0.0), beat_t(2, 2.0))
    place(low, pan(I.timpani(F(35), 0.26, rr(), dur=1.6), 0.0), beat_t(2, 3.0))
    tens = I.pad([F(77), F(83)], 1.5, 0.2, rr(), att=0.5, rel=0.5, warm=2400.0, detune=11.0, trem=lambda t: 1 + 0.32 * np.sin(2 * np.pi * 6.1 * t))
    place(pads, tens, beat_t(2, 2.0))
    events.append({"t": round(beat_t(2, 2.0), 3), "what": "tension: timpani swell and a beating high interval, tonal", "midi": [77, 83]})

    # bar 4: the final D major rings past the last downbeat, then fades with the picture
    for m, tb in [(74, 2.0), (78, 2.0), (81, 2.0), (86, 2.0), (90, 3.5)]:
        place(keys, pan(I.glock(F(m), 0.2, rr(), dur=2.2), 0.22), beat_t(3, tb))
    events.append({"t": round(beat_t(3, 2.0), 3), "what": "D major bell chord: the release", "midi": [74, 78, 81, 86]})

    hall = make_ir(2.4, seeds["music_ir"], pre=0.022, hf=1.5, early=[(0.09, 0.32, -0.4), (0.15, 0.24, 0.5)])
    # relative balance inside the music, by integrated loudness, so the melody sits clearly over the pad
    pads = pads * dbg(-24.0 - integrated(pads))
    keys = keys * dbg(-23.0 - integrated(keys))
    low = low * dbg(-27.0 - integrated(low))
    dry = pads + keys + low
    wet = convolve_st((0.16 * pads + 0.34 * keys + 0.12 * low).mean(0), hall)
    out = hp(dry + 0.8 * wet, 32, 2)
    balance = {"padLufs": round(float(integrated(pads)), 1), "keysLufs": round(float(integrated(keys)), 1), "lowLufs": round(float(integrated(low)), 1)}
    events.append({"t": 0.0, "what": "balance inside the music", **balance})
    return out, events


# ================================================================ sound effects, one per manifest cue
def fx_hop_lift(r: np.random.Generator) -> np.ndarray:
    return G.whoosh(0.2, r, peak=0.07, f_lo=500, f_hi=1700, width=0.7, tail=0.05, air=0.05) * 0.5


def fx_hop_contact(r: np.random.Generator) -> np.ndarray:
    """a soft rounded landing, not a footstep: the sfx_gen soft impact, plus a low pitched body drop"""
    d = 0.34
    t = tt(d)
    body = np.exp(-t / 0.055) * np.sin(dsp.phase(118.0 * (1 + 0.55 * np.exp(-t / 0.018)))) * 1.25
    thump = G.push_thump(r)
    x = np.zeros_like(t)
    m = min(len(x), len(thump))
    x[:m] += 0.42 * lp(thump[:m], 1500)
    return fades(x + body, 0.0005, 0.03)


def fx_wave_swish(r: np.random.Generator) -> np.ndarray:
    return G.whoosh(0.28, r, peak=0.11, f_lo=900, f_hi=3200, width=0.65, tail=0.06, air=0.3) * 0.7


def fx_artifact_chime(r: np.random.Generator) -> np.ndarray:
    """three bars struck almost together, with a triangle shimmer: an original chord built on A and E over D"""
    d = 3.4
    x = np.zeros((2, ns(d)))
    for m, dt, g, p in [(81, 0.0, 1.0, -0.15), (88, 0.028, 0.8, 0.15), (93, 0.06, 0.62, -0.05), (97, 0.1, 0.34, 0.25)]:
        place(x, pan(I.vibes(I.m2f(m), 0.7, r, dur=3.0, trem_depth=0.1, trem=3.6), p), dt, g)
    place(x, pan(I.triangle(0.42, r, dur=2.4, f=2093.0), 0.1), 0.012, 0.42)
    return fades(x, 0.0, 0.3)


def fx_surprise_pop(r: np.random.Generator) -> np.ndarray:
    """a quick rising wooden note: a reaction sound, without any voice"""
    d = 0.3
    t = tt(d)
    y = np.exp(-t / 0.05) * np.sin(dsp.phase(310.0 * (1 + 0.9 * (1 - np.exp(-t / 0.035))))) * 0.9
    y += I.pluck(I.m2f(76), 0.5, r, dur=d, bright=0.8)[: len(t)] * 0.5
    return fades(y, 0.001, 0.04)


def fx_release_bell(r: np.random.Generator) -> np.ndarray:
    d = 2.2
    x = np.zeros((2, ns(d)))
    for m, g, p, dt in [(86, 1.0, 0.0, 0.0), (93, 0.6, 0.2, 0.012), (98, 0.34, -0.2, 0.022)]:
        place(x, pan(I.glock(I.m2f(m), 0.75, r, dur=2.0), p), dt, g)
    place(x, pan(I.triangle(0.3, r, dur=1.8, f=3136.0), -0.05), 0.0, 0.3)
    return x


def fx_node_sparkle(r: np.random.Generator) -> np.ndarray:
    return I.glock(I.m2f(int(r.choice([86, 88, 90, 93, 95, 98]))), 0.42, r, dur=1.0)


def fx_camera_air(r: np.random.Generator) -> np.ndarray:
    return G.whoosh(1.5, r, peak=0.7, f_lo=170, f_hi=620, width=1.0, tail=0.32, air=0.03) * 0.55


FX = {
    "hop_lift": (fx_hop_lift, -25.0, 0.05), "hop_contact": (fx_hop_contact, -23.5, 0.12), "wave_swish": (fx_wave_swish, -24.0, 0.14),
    "artifact_chime": (fx_artifact_chime, -21.0, 0.3), "surprise_pop": (fx_surprise_pop, -24.0, 0.16), "release_bell": (fx_release_bell, -22.0, 0.3),
    "node_sparkle": (fx_node_sparkle, -25.0, 0.32), "camera_air": (fx_camera_air, -32.0, 0.05),
}


def render_sfx(n: int, m: dict, seeds: dict) -> tuple[np.ndarray, list[dict]]:
    out = np.zeros((2, n))
    send = np.zeros(n)
    log = []
    for c in m["cues"]:
        fn, level, wet = FX[c["type"]]
        r = rng(c["seed"])
        x = np.asarray(fn(r), float)
        x = pan(x, c["pan"]) if x.ndim == 1 else x
        # every event is levelled by its own loudest 400 ms, so a cue's level does not depend on its length
        peak = dsp.momentary_max(x)
        g = dbg(level + c["gainDb"] - peak) if np.isfinite(peak) else 1.0
        x = x * g
        place(out, x, c["sample"] / SR)
        k = c["sample"]
        e = min(n, k + x.shape[1])
        if e > k:
            send[k:e] += wet * x.mean(0)[: e - k]
        log.append({
            "id": c["id"], "type": c["type"], "frame": c["frame"], "seconds": c["seconds"], "sample": k, "pan": round(c["pan"], 3), "seed": c["seed"], "function": fn.__name__,
            "levelDb": round(level + c["gainDb"], 1), "gainApplied": round(20 * np.log10(g), 2), "lengthSamples": int(x.shape[1]), "source": c["source"],
        })
    room = make_ir(1.8, seeds["sfx_ir"], pre=0.014, hf=1.4, early=[(0.07, 0.4, -0.5), (0.13, 0.3, 0.6)])
    out = out + 0.75 * convolve_st(send, room)
    return hp(out, 28, 2), log


# ================================================================ ambience
def render_ambience(n: int, fps: int, seeds: dict) -> np.ndarray:
    dur = n / SR
    r = rng(seeds["ambience"])
    room = G.breeze(dur, r, level=0.8, gust=0.11, bright=520)
    # the stone room: a very low steady tone with slow movement
    tone = lp(dsp.colored(n, r, 2.0), 190, 2) * (0.8 + 0.2 * smooth_noise(n, r, 0.18))
    room = room + st(tone) * 0.55
    # the artifact's hum: pitched air that rises and falls with its glow, a bed under the light rather than an event
    t = np.arange(n) / SR
    glow = np.interp(t, [0, t_of(200, fps), t_of(222, fps), t_of(262, fps), t_of(321, fps), dur], [0.4, 0.4, 1.0, 0.8, 1.0, 0.55])
    hum = np.zeros(n)
    for f, a in [(110.0, 1.0), (220.5, 0.5), (330.2, 0.22), (441.0, 0.1)]:
        hum += a * np.sin(2 * np.pi * f * t + r.uniform(0, 6.28))
    hum = hum * glow * (0.9 + 0.1 * np.sin(2 * np.pi * 0.31 * t))
    room = room + 0.05 * widen(hum, r, 9.0, 0.7)
    # two far-off creaks of old shelving, placed away from any cue so nothing masks them
    for at, p, seed_ in [(0.9, -0.5, 7), (8.15, 0.55, 8)]:
        c = G.creak(0.42, rng(seeds["ambience"] + seed_), 70, 120, G.WOOD, [(0, 0), (0.4, 1), (1, 0)], rough=0.18, noise=0.02, scale=0.9)
        place(room, pan(lp(c, 2200) * 0.05, p), at)
    return hp(fades(room, 0.6, 0.9), 26, 2)


# ================================================================ master
def limiter(x: np.ndarray, ceil_db: float = CEIL_DBTP, look: float = 0.003, rel: float = 0.08) -> tuple[np.ndarray, np.ndarray]:
    """4x oversampled peak detection, look-ahead, one-pole release. Returns the limited signal and the gain curve."""
    from scipy import ndimage, signal

    c = dbg(ceil_db)
    n = x.shape[1]
    up = np.abs(signal.resample_poly(x, 4, 1, axis=-1)).max(0)
    pk = np.pad(up, (0, max(0, 4 * n - len(up))))[: 4 * n].reshape(n, 4).max(1)
    gr = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    La = max(1, ns(look))
    g1 = ndimage.minimum_filter1d(gr, 2 * La + 1, mode="nearest")
    kr = 1 - np.exp(-1 / (rel * SR))
    g2 = np.empty(n)
    g = 1.0
    for i in range(n):
        g = min(g1[i], g + (1 - g) * kr)
        g2[i] = g
    g3 = np.minimum(ndimage.uniform_filter1d(g2, 2 * La + 1, mode="nearest"), 1.0)
    return x * g3[None, :], g3


def ffmpeg_ebur(path: Path) -> dict:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], capture_output=True, text=True, timeout=300)
    txt = r.stderr
    i = txt.rfind("Summary:")
    out: dict = {"raw": txt[i:].strip() if i >= 0 else txt[-600:]}
    for line in txt[i:].splitlines() if i >= 0 else []:
        s = line.strip()
        if s.startswith("I:"):
            out["integratedLufs"] = float(s.split()[1])
        if s.startswith("LRA:"):
            out["lra"] = float(s.split()[1])
        if s.startswith("Peak:"):
            out["truePeakDbfs"] = float(s.split()[1])
    return out


def stem_report(x: np.ndarray) -> dict:
    v = integrated(x)
    return {"samples": int(x.shape[1]), "channels": int(x.shape[0]), "integratedLufs": round(float(v), 2) if np.isfinite(v) else None, "truePeakDbtp": round(float(true_peak(x)), 2), "rmsDbfs": round(float(20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)), 2)}


def main() -> int:
    m = load_manifest()
    n, fps = m["samples"], m["fps"]
    seeds = {"music": 26110601, "music_ir": 26110602, "sfx_ir": 26110603, "ambience": 26110604}
    OUT.mkdir(parents=True, exist_ok=True)

    music, music_events = render_music(n + ns(1.5), seeds)
    sfx, sfx_log = render_sfx(n + ns(3.5), m, seeds)
    amb = render_ambience(n, fps, seeds)

    # any tail past the last frame is cut here, then faded out inside the picture
    music, sfx, amb = exact(music, n), exact(sfx, n), exact(amb, n)

    # stem balance, set by integrated loudness so it holds whatever the raw synthesis levels were
    music = music * dbg(-22.0 - integrated(music))
    amb = amb * dbg(-38.0 - integrated(amb))

    # the same ending for every stem: quiet tail, silent on the last sample
    fade = np.ones(n)
    a = ns(12.0 - 1.15)
    fade[a:] = np.cos(np.linspace(0, np.pi / 2, n - a)) ** 1.6
    music, sfx, amb = music * fade, sfx * fade, amb * fade

    mix0 = music + sfx + amb
    gain = TARGET_LUFS - integrated(mix0)
    y = mix0
    g3 = np.ones(n)
    for it in range(6):
        y, g3 = limiter(mix0 * dbg(gain))
        L = integrated(y)
        print(f"master pass {it}: gain {gain:+.2f} dB, {L:.2f} LUFS, TP {true_peak(y):.2f} dBTP, max reduction {-20 * np.log10(g3.min()):.2f} dB", flush=True)
        if abs(L - TARGET_LUFS) < 0.05:
            break
        gain += TARGET_LUFS - L
    y = exact(y, n)
    y[:, -1] = 0.0

    stems = {"stem_music": music * dbg(gain), "stem_sfx": sfx * dbg(gain), "stem_ambience": amb * dbg(gain)}
    for name, x in stems.items():
        write_wav(str(OUT / f"{name}.wav"), exact(x, n))
    write_wav(str(OUT / "mix.wav"), y)

    # ---------------- measure what was written, from the files
    measured = {}
    for name in ["stem_music", "stem_sfx", "stem_ambience", "mix"]:
        x, sr = dsp.read_wav(str(OUT / f"{name}.wav"))
        rep = stem_report(x)
        rep["sampleRate"] = sr
        rep["sha256"] = hashlib.sha256((OUT / f"{name}.wav").read_bytes()).hexdigest()
        measured[name] = rep
    x, _ = dsp.read_wav(str(OUT / "mix.wav"))
    ebur = ffmpeg_ebur(OUT / "mix.wav")
    ends = {"lastSampleAbs": float(np.abs(x[:, -1]).max()), "firstSampleAbs": float(np.abs(x[:, 0]).max())}
    second = [round(float(20 * np.log10(np.sqrt(np.mean(x[:, ns(i): ns(i + 1)] ** 2)) + 1e-12)), 1) for i in range(12)]
    report = {
        "timelineHash": m["timelineHash"], "voice": "none", "voiceNote": "No narration. This is an instrumental demo with sound effects and ambience.",
        "sampleRate": SR, "channels": 2, "samplesPerChannel": int(x.shape[1]), "expectedSamples": n, "seconds": x.shape[1] / SR,
        "target": {"integratedLufs": TARGET_LUFS, "limiterCeilingDbtp": CEIL_DBTP, "truePeakLimitDbtp": -1.0},
        "mix": {
            "integratedLufs": round(float(integrated(x)), 2), "truePeakDbtp": round(float(true_peak(x)), 2), "lra": round(float(lra(x)), 2),
            "maxMomentaryLufs": round(float(np.max(momentary(x))), 2), "maxShortTermLufs": round(float(np.max(short_term(x))), 2),
            "masterGainDb": round(float(gain), 2), "limiterMaxReductionDb": round(float(-20 * np.log10(g3.min())), 3), "limiterActivePercent": round(float((g3 < 0.9886).mean() * 100), 3),
            "rmsPerSecondDbfs": second, **ends,
        },
        "ffmpegEbur128": ebur, "files": measured, "seeds": seeds,
        "reuse": {
            "dsp": ["rng", "ns", "tt", "dbg", "lp", "hp", "pan", "place", "fades", "st", "widen", "colored", "smooth_noise", "phase", "make_ir", "convolve_st", "integrated", "momentary", "momentary_max", "short_term", "lra", "true_peak", "read_wav", "write_wav"],
            "instruments": ["m2f", "pad", "vibes", "musicbox", "glock", "pluck", "brass", "timpani", "triangle"],
            "sfx_gen": ["whoosh", "push_thump", "breeze", "creak"],
            "notImported": ["timeline.py", "sfx.py", "music.py", "mix.py"],
        },
        "score": {"bpm": BPM, "key": "D with a raised fourth, B minor colour, resolving to D major", "events": music_events, "origin": "composed for this pilot. tests/visual/p5_audio_qa.py checks that its melody shares no interval sequence with the bridge march"},
        "sfx": sfx_log,
    }
    (OUT / "audio-measurements.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report["mix"][k] for k in ("integratedLufs", "truePeakDbtp", "lra", "maxMomentaryLufs", "limiterMaxReductionDb")}), "samples", x.shape[1], "timeline", m["timelineHash"][:16])
    print("ffmpeg:", {k: v for k, v in ebur.items() if k != "raw"})
    print("rms per second dBFS:", second)
    if x.shape[1] != n:
        raise SystemExit(f"sample count {x.shape[1]} != {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

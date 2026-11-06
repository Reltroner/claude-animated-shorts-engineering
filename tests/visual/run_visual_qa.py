# Checks that need real output: T05 (pixels), T06 (live engine trace and negative controls), T08 (MP4), T09 (reproducibility),
# T10 (baseline), T11 (privacy), T12 (inspection sheets). Results are read from actual files and commands, and each check
# records its evidence. T12 only produces the sheets: looking at them is a human or reviewer step, so it never reports PASS here.
# Run after: npm run render:all
# Usage: python tests/visual/run_visual_qa.py
import hashlib, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from wb_measure import ink_mask, label, load_rgb, measure, silhouette

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P3 = os.path.join(ROOT, ".local", "p3-white-ball")
STILLS, REPORTS, RENDERS = os.path.join(P3, "stills"), os.path.join(P3, "reports"), os.path.join(P3, "renders")
MP4 = os.path.join(RENDERS, "WhiteBallNpcTest.mp4")
REPEAT = os.path.join(RENDERS, "WhiteBallNpcTest_repeat.mp4")
EXPRS = ["default", "happy-closed", "wink", "surprised", "tired", "anxious", "sparkly-happy"]
PAIRS = {"default": 0, "happy-closed": 47, "wink": 50, "surprised": 96, "tired": 120, "anxious": 150, "sparkly-happy": 230}
results = []


def check(tid, name, ok, evidence):
    results.append({"id": tid, "check": name, "result": "PASS" if ok else "FAIL", "evidence": evidence})
    print(f"{'PASS' if ok else 'FAIL'}  {tid}  {name}\n      {evidence}")


def run(*a, **k):
    return subprocess.run(a, capture_output=True, text=True, cwd=ROOT, **k)


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


# ---------------- T05: the identity contract, measured from rendered pixels ----------------
for e in EXPRS:
    m = measure(load_rgb(os.path.join(STILLS, f"ref_{e}_src{PAIRS[e]:03d}.png")))
    s = m["shade"]["lowerRight_r90"]
    lavender = s[2] > s[0] and s[2] > s[1] and 150 < s[1] < 215
    white = min(m["shade"]["center"]) >= 245
    check("T05", f"rendered {e}: two detached hands, near-round white body, thick near-black outline, lavender lower right",
          m["hand_count"] == 2 and abs(m["body_hw"] - 1.05) < 0.02 and 0.024 < m["outline_rel"] < 0.032 and lavender and white,
          f"hands {m['hand_count']}, body h/w {m['body_hw']:.3f}, outline/width {m['outline_rel']:.4f}, centre {m['shade']['center']}, lower right {s}, body {m['body_w']:.1f} x {m['body_h']:.1f}")

pink = {e: measure(load_rgb(os.path.join(STILLS, f"ref_{e}_src{PAIRS[e]:03d}.png"))) for e in EXPRS}
for e in ("default", "happy-closed", "wink", "sparkly-happy"):
    c = pink[e]["mouth"]["color"]
    check("T05", f"rendered {e}: open pink mouth", abs(c[0] - 180) < 12 and abs(c[1] - 115) < 12 and abs(c[2] - 125) < 12, f"median colour {c} (source about [180, 115, 125]), {pink[e]['mouth']['w']} x {pink[e]['mouth']['h']} px")
c = pink["surprised"]["mouth"]
check("T05", "rendered surprised: small round mouth", c["w"] < 45 and c["h"] > c["w"], f"{c['w']} x {c['h']} px")
for e in ("tired", "anxious"):
    check("T05", f"rendered {e}: line mouth, no open pink area", "mouth" not in pink[e], f"pink mouth detected: {'mouth' in pink[e]}")
check("T05", "rendered anxious: blue sweat drop; no other expression has one", "drop" in pink["anxious"] and not any("drop" in pink[e] for e in EXPRS if e != "anxious"), f"anxious drop {pink['anxious'].get('drop')}")

# ---------------- T05: no clipping, at output resolution, for every expression and action still ----------------
vertical = [f for f in sorted(os.listdir(STILLS)) if f.startswith(("expr_", "action_"))]
worst, bad = 10_000, []
for f in vertical:
    m = measure(load_rgb(os.path.join(STILLS, f)))
    x0, y0, x1, y1 = m["bbox"]
    margin = min(x0, y0, 1080 - 1 - x1, 1920 - 1 - y1)
    worst = min(worst, margin)
    if margin < 40 or m["hand_count"] != 2:
        bad.append((f, margin, m["hand_count"]))
check("T05", f"{len(vertical)} vertical stills: fully inside the frame with two hands found", not bad and len(vertical) >= 24, f"smallest margin to a frame edge {worst} px; problems: {bad}")

# ---------------- T05: blink is rendered, not just computed ----------------
eye_regions = lambda f: [r for r in measure(load_rgb(os.path.join(STILLS, f)))["face_regions"] if r["dy"] < 0 and r["area"] > 1500]
b0, b1, b2 = (eye_regions(f"blink_default_f{n}.png") for n in (0, 92, 93))
check("T05", "rendered blink: both open eyes at frame 0, flattened at frame 92, gone at frame 93", len(b0) == 2 and len(b2) == 0 and (not b1 or max(r["area"] for r in b1) < 0.8 * min(r["area"] for r in b0)),
      f"large eye interiors: frame 0 {[r['area'] for r in b0]}, frame 92 {[r['area'] for r in b1]}, frame 93 {[r['area'] for r in b2]}")

# ---------------- T06: the live browser ran the real engine ----------------
def read_trace(name):
    p = os.path.join(REPORTS, name)
    return [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()] if os.path.exists(p) else []

tv, ts = read_trace("trace-video.jsonl"), read_trace("trace-stills.jsonl")
frames_seen = sorted({int(t["label"].split("|")[0][1:]) for t in tv})
allt = tv + ts
draws = sum(t["drawCalls"] for t in allt)
pens = sum(t["penInstances"] for t in allt)
check("T06", "live trace: every frame of the MP4 passed through Pool + Actor", frames_seen == list(range(60)) and all(t["poolRequests"] >= 1 and t["actorsVisible"] == 1 and t["fxVisible"] == 1 for t in tv),
      f"{len(tv)} trace lines cover {len(frames_seen)} distinct frames")
check("T06", "live trace: every drawing received a real Pen, and the Actor material holds the Pool's CanvasTexture", draws > 0 and draws == pens and all(t["mapIsPoolCanvasTexture"] for t in allt),
      f"{draws} draw calls, {pens} real Pen instances, canvas {allt[0]['mapWidth']}x{allt[0]['mapHeight']}")
check("T06", "live trace: the card is on NOINK and the camera enabled that layer", all(t["actorLayerMask"] == 1 << t["noInkLayer"] and t["cameraLayerMask"] & (1 << t["noInkLayer"]) for t in tv),
      f"actor mask {tv[0]['actorLayerMask']}, camera mask {tv[0]['cameraLayerMask']}, NOINK {tv[0]['noInkLayer']}, three r{tv[0]['three']}, tone mapping {tv[0]['toneMapping']}, GPU {tv[0]['gpu']}")
ctrl, hidden, noink = (load_rgb(os.path.join(STILLS, n)) for n in ("neg_control.png", "neg_actor_hidden.png", "neg_camera_without_noink.png"))
check("T06", "negative control: the same scene with the Actor hidden has no character", ink_mask(ctrl).sum() > 10000 and ink_mask(hidden).sum() == 0,
      f"ink pixels: control {int(ink_mask(ctrl).sum())}, actor hidden {int(ink_mask(hidden).sum())}")
check("T06", "negative control: a camera without the NOINK layer shows nothing, which proves the layer check matters", ink_mask(noink).sum() == 0 and np.ptp(noink.reshape(-1, 3), axis=0).max() == 0,
      f"ink pixels {int(ink_mask(noink).sum())}, distinct colours {len(np.unique(noink.reshape(-1, 3), axis=0))}")
shadow_only = np.abs(hidden.astype(np.int16) - noink.astype(np.int16)).sum(axis=2) > 30
ys, xs = np.nonzero(shadow_only)
check("T06", "the floor shadow is a separate Fx card: it stays when the Actor is hidden", shadow_only.sum() > 5000,
      f"{int(shadow_only.sum())} px darkened, x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}" if shadow_only.sum() else "nothing darkened")
scan = run("git", "grep", "-n", "--untracked", "-E", "<svg|createElementNS", "--", "studio/src", "src/npc").stdout.strip()
check("T06", "no SVG renderer in the studio or NPC sources", scan == "", scan or "no matches for <svg or createElementNS")

# ---------------- T08: the MP4 itself ----------------
pr = json.loads(run("ffprobe", "-v", "error", "-count_frames", "-show_entries", "stream=index,codec_type,codec_name,profile,width,height,r_frame_rate,avg_frame_rate,pix_fmt,nb_read_frames,color_space:format=duration,size,format_name", "-of", "json", MP4).stdout)
open(os.path.join(REPORTS, "ffprobe-WhiteBallNpcTest.json"), "w", encoding="utf-8").write(json.dumps(pr, indent=1))
v = next(s for s in pr["streams"] if s["codec_type"] == "video")
aud = [s for s in pr["streams"] if s["codec_type"] == "audio"]
dur = float(pr["format"]["duration"])
check("T08", "video stream is H.264 at 1080x1920", v["codec_name"] == "h264" and v["width"] == 1080 and v["height"] == 1920, f"{v['codec_name']} ({v.get('profile')}), {v['width']}x{v['height']}, {v.get('pix_fmt')}")
check("T08", "frame rate is exactly 30/1", v["r_frame_rate"] == "30/1" and v["avg_frame_rate"] == "30/1", f"r_frame_rate {v['r_frame_rate']}, avg_frame_rate {v['avg_frame_rate']}")
check("T08", "exactly 60 decoded video frames, counted by decoding", int(v["nb_read_frames"]) == 60, f"nb_read_frames {v['nb_read_frames']}")
check("T08", "duration is about 2 seconds", abs(dur - 2.0) < 0.05, f"{dur} s, {pr['format']['size']} bytes, container {pr['format']['format_name']}, audio streams {len(aud)}")
err = run("ffmpeg", "-v", "error", "-i", MP4, "-map", "0:v:0", "-f", "null", "-").stderr.strip()
check("T08", "a full decode reports no errors", err == "", err[:300] or "ffmpeg -v error printed nothing")

# decode every frame at full size for the frame-level checks
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", MP4, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, 1920, 1080, 3)
ms, problems, xs_, ws_, lifts = [], [], [], [], []
for i, fr in enumerate(frames):
    m = measure(fr)
    ms.append(m)
    x0, y0, x1, y1 = m["bbox"]
    margin = min(x0, y0, 1079 - x1, 1919 - y1)
    if m["hand_count"] != 2 or margin < 40:
        problems.append((i, m["hand_count"], margin))
    xs_.append(m["body"]["cx"]); ws_.append(m["body"]["rx"]); lifts.append(m["body"]["cy"] + m["body"]["ry"])
check("T08", "every decoded frame shows the whole character with two hands", not problems, f"{len(frames)} frames; problems {problems[:10]}; smallest margin {min(min(m['bbox'][0], m['bbox'][1], 1079 - m['bbox'][2], 1919 - m['bbox'][3]) for m in ms)} px")
check("T08", "the character stays centred and does not change size between frames", np.ptp(xs_) < 16 and np.ptp(ws_) / np.mean(ws_) < 0.06,
      f"body centre x {min(xs_):.1f}-{max(xs_):.1f} (frame centre 539.5), half-width {min(ws_):.1f}-{max(ws_):.1f}")
ground = max(lifts)
air = [ground - l for l in lifts]
check("T08", "the body really leaves the ground in the rendered video", max(air) > 60, f"largest measured rise {max(air):.1f} px, frames off the ground by more than 10 px: {sum(a > 10 for a in air)}")
small = frames[:, ::8, ::8].astype(np.int16)
diffs = np.abs(np.diff(small, axis=0)).mean(axis=(1, 2, 3))
seam = float(np.abs(small[59] - small[0]).mean())
check("T08", "every frame differs from the one before it, and no pop dwarfs the motion around it", float(diffs.min()) > 0 and float(diffs.max()) < 8 * float(np.median(diffs)) + 1,
      f"mean frame diff {diffs.mean():.3f}, min {diffs.min():.4f}, max {diffs.max():.3f}, loop seam 59 to 0 {seam:.3f}")
np.save(os.path.join(REPORTS, "video-frame-diffs.npy"), diffs)

qa_dir = os.path.join(REPORTS, "short_qa")
qa = run(sys.executable, os.path.join("templates", "scripts", "short_qa.py"), MP4, qa_dir)
check("T08", "the repository's own short_qa.py runs unmodified on the MP4 (numpy and Pillow are installed)", qa.returncode == 0, (qa.stdout.strip().replace("\n", " | ") if qa.returncode == 0 else qa.stderr)[:600])

# ---------------- T09: reproducibility ----------------
rp = json.load(open(os.path.join(REPORTS, "repro.json"), encoding="utf-8"))
same = lambda a, b: sum(x != y for x, y in zip(a, b))
check("T09", "sequential (one page, Pool history) vs fresh browser process: 60 frames byte-identical", len(rp["sequential"]) == 60 and same(rp["sequential"], rp["freshBrowser"]) == 0, f"{same(rp['sequential'], rp['freshBrowser'])} of {len(rp['sequential'])} frames differ, GL {rp['gl']}")
check("T09", "sequential vs 4 parallel tabs (frames split across pages): byte-identical", same(rp["sequential"], rp["parallel"]) == 0, f"{same(rp['sequential'], rp['parallel'])} of 60 frames differ")
check("T09", "single stills in fresh tabs match each other and the sequential run", all(s["a"] == s["b"] == s["sequentialRun"] for s in rp["stills"]), json.dumps([{"frame": s["frame"], "sha256": s["a"][:16], "aEqualsB": s["a"] == s["b"], "equalsSequential": s["a"] == s["sequentialRun"]} for s in rp["stills"]]))
md5 = lambda p: run("ffmpeg", "-v", "error", "-i", p, "-map", "0:v:0", "-f", "framemd5", "-").stdout
m1, m2 = md5(MP4), md5(REPEAT)
check("T09", "rendering the whole MP4 twice gives identical decoded frames", m1 == m2 and m1.count("\n") > 60, f"decoded frame hashes equal: {m1 == m2}; file bytes equal: {sha(MP4) == sha(REPEAT)}; sha256 {sha(MP4)[:16]}")

# ---------------- T10: protected baseline ----------------
PROTECTED = ["templates", "references", "SKILL.md", "LICENSE"]
porcelain = run("git", "status", "--porcelain", "--", *PROTECTED).stdout.strip()
diffq = run("git", "diff", "--name-only", "e3b817b", "--", *PROTECTED).stdout.strip()
base = {}
for l in open(os.path.join(REPORTS, "baseline-before-p3.sha256"), encoding="utf-8"):
    h, name = l.strip().split(None, 1)
    base[name.lstrip("*")] = h
changed = [n for n, h in base.items() if sha(os.path.join(ROOT, n)) != h]
extra = [os.path.relpath(os.path.join(d, f), ROOT).replace("\\", "/") for top in ("templates", "references") for d, _, fs in os.walk(os.path.join(ROOT, top)) for f in fs]
new_files = [f for f in extra if f not in base]
check("T10", "protected templates, references, SKILL.md and LICENSE are unchanged", not porcelain and not diffq and not changed and not new_files,
      f"git status empty: {not porcelain}; git diff against e3b817b empty: {not diffq}; {len(base)} files re-hashed against the pre-P3 snapshot, changed {changed}, added {new_files}")

# ---------------- T11: privacy and git safety ----------------
ignored = ".local/npc-reference/white-ball-npc-v1/frames-png/frame_000000.png", ".local/p3-white-ball/renders/WhiteBallNpcTest.mp4", "node_modules/three/package.json", "studio/out/x.mp4"
not_ign = [p for p in ignored if run("git", "check-ignore", "-q", p).returncode != 0]
check("T11", "private frames, the render and dependencies are ignored by git", not not_ign, f"checked {len(ignored)} paths, not ignored: {not_ign}")
keep = "studio/package.json", "package-lock.json", "studio/src/Root.tsx", "src/npc/white-ball/WhiteBallPen.ts", "tests/t01-identity.test.ts", "docs/WHITE-BALL-V2-NPC-CONTRACT.md"
wrong = [p for p in keep if run("git", "check-ignore", "-q", p).returncode == 0]
check("T11", "sources are not ignored by accident", not wrong, f"checked {len(keep)} paths, wrongly ignored: {wrong}")
staged = run("git", "diff", "--cached", "--name-only").stdout.strip()
tracked_private = [l for l in run("git", "ls-files").stdout.splitlines() if l.startswith(".local/") or "frame_0" in l]
head = run("git", "rev-parse", "HEAD").stdout.strip()
upstream = run("git", "rev-parse", "--verify", "-q", "origin/feat/white-ball-npc-v2").stdout.strip()
check("T11", "nothing staged, nothing private tracked, no commit made, branch not on the remote", not staged and not tracked_private and head.startswith("e3b817b") and not upstream,
      f"staged: {staged or 'none'}; tracked private files: {len(tracked_private)}; HEAD {head[:7]}; origin/feat/white-ball-npc-v2: {upstream or 'absent'}")
untracked = run("git", "ls-files", "--others", "--exclude-standard").stdout.splitlines()
media = [f for f in untracked if f.lower().endswith((".png", ".jpg", ".jpeg", ".mp4", ".mov", ".webm", ".npy", ".npz"))]
check("T11", "no media or data files among the files git could add", not media, f"{len(untracked)} addable untracked files, media among them: {media}")

# ---------------- T12: inspection sheets. These do not grade anything. ----------------
def sheet(paths, cols, size, path, labels):
    W, H = size
    rows = (len(paths) + cols - 1) // cols
    S = Image.new("RGB", (cols * W, rows * (H + 18)), "white")
    d = ImageDraw.Draw(S)
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB") if isinstance(p, str) else p
        im.thumbnail((W, H), Image.LANCZOS)
        x, y = (i % cols) * W, (i // cols) * (H + 18)
        S.paste(im, (x + (W - im.width) // 2, y + 18))
        d.text((x + 4, y + 3), labels[i], fill="black")
    S.save(path, quality=90)

sheet([os.path.join(STILLS, f"expr_{i}_{e}.png") for i, e in enumerate(EXPRS)], 7, (270, 480), os.path.join(REPORTS, "sheet_expressions.png"), EXPRS)
acts = sorted(f for f in os.listdir(STILLS) if f.startswith("action_"))
sheet([os.path.join(STILLS, f) for f in acts], 9, (216, 384), os.path.join(REPORTS, "sheet_actions.png"), [f[7:-4] for f in acts])
sheet([Image.fromarray(fr) for fr in frames], 10, (180, 320), os.path.join(REPORTS, "contact_video.jpg"), [f"f{i}" for i in range(len(frames))])
print("wrote inspection sheets: sheet_expressions.png, sheet_actions.png, contact_video.jpg")

# ---------------- the record ----------------
json.dump(results, open(os.path.join(REPORTS, "visual-qa.json"), "w", encoding="utf-8"), indent=1)
fails = [r for r in results if r["result"] != "PASS"]
md = ["# WB-NPC-001 visual QA", "", f"{len(results) - len(fails)} of {len(results)} automated checks passed. T12 (looking at the sheets) and owner approval are not automated.", "",
      "| test | result | check | evidence |", "|---|---|---|---|"]
for r in results:
    md.append(f"| {r['id']} | {r['result']} | {r['check']} | {r['evidence'].replace('|', '/')} |")
open(os.path.join(REPORTS, "visual-qa.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
print(f"\n{len(results) - len(fails)} of {len(results)} automated checks passed")
sys.exit(1 if fails else 0)

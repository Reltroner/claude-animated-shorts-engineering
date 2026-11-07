"""P5 reference audit: merge measurements with the private visual observations into reference-inventory.csv.

Measured columns come from tests/visual/p5_reference_measure.py and are prefixed m_. Observation columns are the agent's
visual judgements and are prefixed o_. They are kept separate on purpose. The observation files live under .local because
they describe private study material.

Exit gate: fails unless every JPG and every Markdown under references/ has a row and every JPG has an observation.
"""
from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "references"
AUDIT = ROOT / ".local" / "p5-white-ball" / "reference-audit"
MEASURE = AUDIT / "measure"

COLUMNS = [
    "path", "kind", "width", "height", "bytes", "sha256",
    "m_panels", "m_panel_size", "m_captions_found", "m_caption_span_permille", "m_caption_black_share", "m_luma_mean", "m_luma_p02", "m_luma_p98",
    "m_sat_p50", "m_vivid_share", "m_dominant_hue", "m_ink_fraction_captions_masked", "m_corner_over_centre", "m_sky_share_top", "m_large_changes",
    "o_subject", "o_camera_scale", "o_lighting_family", "o_world_geometry", "o_outline", "o_dof", "o_grade", "o_environment", "o_characters", "o_captions",
    "adopted_generic_technique", "prohibited_literal_content",
]

MD_NOTES = {
    "references/STYLE_BIBLE.md": ("format, picture and camera summary (its ease-out burst claim is contradicted by motion.md)", "script formula, voice, captions, channel staging"),
    "references/reports/CONTEXT.md": ("study framing and the instruction to mask captions; lists paths that are not in this repository", "bridge story, historical paths treated as present"),
    "references/reports/motion.md": ("symmetric glides, push-in during holds, 7-frame kicks, blink rule, reaction lead", "walk cycles, march cadence, hammer staging"),
    "references/reports/depth.md": ("thin-lens DOF on chosen shots, focus on the face, glow only on emissive sources, fog colour near the horizon colour", "bridge DOF table, bridge fog distances"),
    "references/reports/textures.md": ("flat colour fields, thin painted lines at half the ink contrast, coloured darks, tiling discipline", "reference surfaces as images, bridge colour tables as targets"),
    "references/reports/characters.md": ("soft lavender crescent and no rim light as general sprite integration only", "humanoid heads, torsos, legs, hats, outfits; the white-ball video is the only identity authority"),
    "references/reports/lighting.md": ("two-tone shadow colours, no SSAO, contact blobs, emissive glow radii", "bridge sun table as a target, humanoid card zones"),
    "references/reports/outlines.md": ("ink on geometry before DOF, near side of depth jumps, NOINK on cards, painted lines stay in textures", "double outlines on the NPC"),
    "references/reports/grade.md": ("gentle S-curve, lifted warm blacks, mild vignette, check whites against the source", "day and golden presets as fixed targets"),
}


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def rows_of(name: str) -> list[dict]:
    with (MEASURE / name).open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> int:
    observed: dict = {}
    for part in ("observed_stills.json", "observed_sheets_01.json", "observed_sheets_02.json", "observed_sheets_03.json", "observed_sheets_04.json"):
        observed.update(json.loads((MEASURE / part).read_text(encoding="utf-8")))
    observed.pop("_note", None)
    adoption = json.loads((MEASURE / "adoption.json").read_text(encoding="utf-8"))
    adoption.pop("_note", None)

    out: list[dict] = []
    missing: list[str] = []

    def obs_fields(stem: str) -> dict:
        o, a = observed.get(stem), adoption.get(stem)
        if not o:
            missing.append(f"no observation: {stem}")
        if not a:
            missing.append(f"no adoption note: {stem}")
        o, a = o or {}, a or {}
        return {
            "o_subject": o.get("subject", ""), "o_camera_scale": o.get("scale", ""), "o_lighting_family": o.get("light", ""), "o_world_geometry": o.get("geometry", ""),
            "o_outline": o.get("outline", ""), "o_dof": o.get("dof", ""), "o_grade": o.get("grade", ""), "o_environment": o.get("env", ""), "o_characters": o.get("chars", ""),
            "adopted_generic_technique": a.get("adopted", ""), "prohibited_literal_content": a.get("prohibited", ""),
        }

    for r in rows_of("stills.csv"):
        stem = Path(r["path"]).stem
        out.append({
            "path": r["path"], "kind": "still", "width": r["w"], "height": r["h"], "bytes": r["bytes"], "sha256": r["sha256"],
            "m_panels": 1, "m_panel_size": f'{r["w"]}x{r["h"]}', "m_captions_found": r["caption_found"], "m_caption_span_permille": r["caption_span_permille"],
            "m_caption_black_share": r["caption_black_share"], "m_luma_mean": r["luma_mean"], "m_luma_p02": r["luma_p02"], "m_luma_p98": r["luma_p98"], "m_sat_p50": r["sat_p50"],
            "m_vivid_share": r["vivid_share"], "m_dominant_hue": r["dominant_hue"], "m_ink_fraction_captions_masked": r["ink_fraction"], "m_corner_over_centre": r["corner_over_centre"],
            "m_sky_share_top": r["sky_share_top"], "m_large_changes": "",
            "o_captions": "one burned-in word line, masked before ink statistics, text not transcribed" if r["caption_found"] == "1" else "none detected", **obs_fields(stem),
        })
    for r in rows_of("sheets.csv"):
        stem = Path(r["path"]).stem
        out.append({
            "path": r["path"], "kind": "contact-sheet", "width": r["w"], "height": r["h"], "bytes": r["bytes"], "sha256": r["sha256"],
            "m_panels": r["panels"], "m_panel_size": f'{r["panel_w"]}x{r["panel_h"]}', "m_captions_found": r["panels_with_caption"], "m_caption_span_permille": "per panel, see measure/panels.csv",
            "m_caption_black_share": "", "m_luma_mean": r["luma_mean"], "m_luma_p02": r["luma_p02_median"], "m_luma_p98": r["luma_p98_median"], "m_sat_p50": r["sat_p50_median"],
            "m_vivid_share": "", "m_dominant_hue": r["top_hues"], "m_ink_fraction_captions_masked": r["ink_fraction_median"], "m_corner_over_centre": "", "m_sky_share_top": f'{r["panels_sky"]} panels with sky',
            "m_large_changes": r["large_changes"], "o_captions": "a burned-in word on almost every panel, masked before ink statistics, text not transcribed", **obs_fields(stem),
        })
    for rel, (adopted, prohibited) in MD_NOTES.items():
        p = ROOT / rel
        out.append({"path": rel, "kind": "markdown", "bytes": p.stat().st_size, "sha256": sha(p), "adopted_generic_technique": adopted, "prohibited_literal_content": prohibited})

    on_disk = {p.relative_to(ROOT).as_posix() for p in REF.rglob("*") if p.is_file()}
    listed = {r["path"] for r in out}
    for extra in sorted(on_disk - listed):
        missing.append(f"on disk but not listed: {extra}")
    for gone in sorted(listed - on_disk):
        missing.append(f"listed but not on disk: {gone}")

    with (AUDIT / "reference-inventory.csv").open("w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="raise")
        wr.writeheader()
        for r in out:
            wr.writerow({c: r.get(c, "") for c in COLUMNS})

    kinds = {k: sum(r["kind"] == k for r in out) for k in ("still", "contact-sheet", "markdown")}
    panels = sum(int(r["m_panels"]) for r in out if r["kind"] == "contact-sheet")
    print(f"rows {len(out)} {kinds} panels {panels} files on disk {len(on_disk)}")
    if missing:
        print("EXIT GATE FAIL")
        for m in missing:
            print(" ", m)
        return 1
    print("EXIT GATE PASS: every file under references/ has a row and every JPG has an observation")
    return 0


if __name__ == "__main__":
    sys.exit(main())

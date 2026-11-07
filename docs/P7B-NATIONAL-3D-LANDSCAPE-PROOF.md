# P7B — Reusable National 3D Profiles and Landscape Proof

**Status:** Source implemented on `main` (2026-11-07); **local Windows compilation, runtime render, video QA and owner creative acceptance pending**. The proof has no canon status and is not a season episode.

## 1. Scope and non-negotiable constraints

P7B is **additive** to P3–P7A. P6's `WhiteBall3DRig` remains the genuine 3D base with **one spherical body, curved expressive face/mouth, exactly two detached real 3D hands**, three inverse-ink shells, shadows and existing P3 pose vocabulary. No replacement model, billboard or CanvasTexture enters the national-character path.

Use the owner-approved active 3D TV performance direction in the [Countryball Character Reference Guide](https://github.com/Reltroner/reltroner-studio-remodeling/blob/main/content/characters/asthortera-countryball-characters.md). **Do not confuse character colors/symbols with automatic artwork approval.** The new adapter is a visual development prototype. Phantomkind and Cosmeilian are not in scope.

All work is committed directly to **`main`**; owner operates a **single local checkout at `C:/Projects/claude-animated-shorts-engineering`**. No secondary Git worktree, local progress branch, destructive reset or force push. Existing `.local/` outputs and baseline P3/P5/P6 media remain ignored and untouched.

## 2. Single owner for each concern

| Concern | Owner |
| --- | --- |
| Color names, emblems, national behavior, accessories, art approval | Countryball Character Reference Guide |
| Season/story and S1E1 | `content/series/asthortera-ball.md` in reltroner-studio-remodeling |
| Program/season/episode manifest identity, statuses and source revision pins | `src/production/contracts/` and `episodes/landscape/asthortera-ball/` (P7A) |
| Data-only national profile lookup | `src/production/nations/profiles.ts` (P7B) |
| Genuine 3D rig topology and pose | **unchanged** `src/npc/white-ball-3d/` (P6) |
| Reusable identity visual adapter | `src/production/nations/NationalCharacter3D.ts` (P7B) |
| Frame-derived landscape proof camera/timing | `src/production/nations/proofTimeline.ts` (P7B) |
| Three.js scene and composition | `studio/src/production/CountryballLandscapeScene.tsx` and `studio/src/compositions/CountryballLandscapeProof.tsx` |
| Rendering and FFprobe QA | `studio/scripts/production/render-p7b.mjs` |
| Test contract | `tests/p7b-nations.test.ts` |

## 3. Four character profiles, no invented nation canon

| Identity | Canon color label | Development render hex | Emblem / accessory |
| --- | --- | --- | --- |
| `pasgerflitball` | Sky Blue | `#58bce9` **provisional** | White airplane |
| `reltronlandball` | Navy Blue | `#192d59` **provisional** | White skyscraper |
| `depcutlandball` | Brown | `#805d40` **provisional** | White book and quill, black fedora |
| `pencilfaniaball` | `#69D84F` | `#69d84f` **specified** | White pencil |

These are **the first approved-reference identities for a technical proof, NOT owner-approved final art**. Emblem silhouettes are original procedural 3D extrusions, with a small raised mounting badge on the body. **Their shape/placement is provisional** and should be compared against the owner's actual national artwork before release. P6's face, mouth, proportions, action list and two hands remain intact.

**Henchowayball is intentionally not fabricated**: the referenced guide currently lacks its detailed visual profile, even though Henchoway appears in the active S1E1 cast. P7A S1E1 remains **`The Pencilfania Problem`**, `sceneIds=[]`, `development-material`, `publication=blocked`. P7B creates **no Henchoway model or screenplay scene**.

## 4. Landscape proof

| Composition ID | Resolution | FPS | Frames | Duration | Audio |
| --- | --- | --- | --- | --- | --- |
| `CountryballLandscapeProofPreview` | 960×540 | 30 | 120 | 4 s | None |
| `CountryballLandscapeProof` | 1920×1080 | 30 | 120 | 4 s | None |

Both compositions draw the same four national profiles and same frame-derived motion/camera timeline, with a real Three.js floor, physical columns, lights, geometry and dynamic shadow maps. The shot is a **generic test gallery**, not a canon location, published video, or animated version of S1E1. There are no character names rendered as captions and no fabricated dialogue/audio.

### Run on the existing Windows `main`

Use a clean, fetched and fast-forwarded local `main`. No new branch or working tree.

```powershell
npm run p7a:validate
npm run p7a:test
npm run p7b:test
npm run typecheck
npm test
npm run build

# Cheapest creative gate: five preview stills.
npm run p7b:stills

# Review motion before rendering 1080p.
npm run p7b:preview
npm run p7b:verify:preview

# Run only after the above pass and the owner approves framing/identity.
npm run p7b:final
npm run p7b:verify
```

Outputs are strictly under `.local/p7b-landscape/`:

- `stills/countryball-f000.png`, `f030`, `f060`, `f090`, `f119`
- `renders/CountryballLandscapeProof_preview.mp4` (silent, lower resolution)
- `renders/CountryballLandscapeProof_final.mp4` (silent, final resolution)
- `reports/preview-ffprobe.json`, `reports/final-ffprobe.json`
- `bundle/` private Remotion bundle

FFprobe validation checks H.264, resolution, 30 fps, exactly 120 decoded frames, ~4 seconds and **no audio stream**. A zero-error FFprobe result does not establish good motion, safe emblem placement or national-art approval.

### Important build note

Remotion CLI may offer to append an ignore rule for `.local/p3-white-ball/bundle-cli`; the root `.gitignore` contains `/.local/` and the accepted generated rule. An automatic CLI prompt that changes `.gitignore` means the final clean-tree gate must **fail** until reconciled; do not use `git reset --hard`. The P7B renderer uses the existing programmatic `@remotion/bundler` path into `.local/p7b-landscape/bundle` and should not require another CLI ignore rule. Verify using `git status --porcelain` after tests.

## 5. Acceptance gates

1. **Source audit:** one owner-local checkout, `main` HEAD matches `origin/main`, no dependency change and existing P3/P5/P6 files preserved.
2. **P7A regression:** validator and all existing tests still PASS.
3. **P7B tests:** every profile uses a genuine P6 sphere+mouth+exactly two hands; colors and canon-label provenance, no texture/card, original solids and proper accessory, unknown nation/species fail closed.
4. **Build:** TypeScript and Remotion bundle PASS.
5. **Stills:** visually confirm readable faces, four different identities, shadows, floor contact, symbol and hat orientation, clean 16:9 framing.
6. **Preview:** 4-second motion review: no clipping, jump, interpenetration, shadow flicker or camera jerk.
7. **Final:** 1920×1080 silent MP4 with FFprobe proof and SHA-256 recorded.
8. **Owner approval:** national symbols, final exact color choices, compositional quality and motion explicitly reviewed. **Pending until owner records acceptance.**

**P7B is a proof of reusable technical identity**, not a complete multi-character narrative runtime. Episode scripts, voice/captions, long-form shot compiler and cache belong to P7C–P7E. Optional Blender asset authoring remains out of scope.

# P7A — Program / Season / Episode Contracts

**Status:** Implemented as a data-only, additive contract layer on `feat/p7a-program-season-episode-contracts`. **No P7 landscape composition, country-specific 3D character adapter, long-form render, synthetic dialogue or published episode is claimed.**

## Objective

Make the existing Three.js / Remotion / Python audio foundation reusable for future episodes without asking an AI coding agent to reimplement a renderer per story. P7A introduces **typed program, season and episode contracts**, validated JSON fixture data, and a read-only CLI. It does not change P3–P6 rendering paths.

## Source boundaries

- [Binding studio constitution](https://github.com/Reltroner/reltroner-studio-remodeling/blob/main/content/principles/reltroner-studio-master-source-of-truth.md): canon and release authority.
- [Asthortera Ball](https://github.com/Reltroner/reltroner-studio-remodeling/blob/main/content/series/asthortera-ball.md): current TV season/story decisions, including **S1E1 "The Pencilfania Problem"**, not a Pasgerflit replacement.
- [Countryball character guide](https://github.com/Reltroner/reltroner-studio-remodeling/blob/main/content/characters/asthortera-countryball-characters.md): 3D performance baseline with **mouth and two detached 3D hands**, nation-specific identity.
- [Document 14 — TV and P7 adapter](https://github.com/Reltroner/progress-documentation/blob/main/RELTRONER%20STUDIO%20%E2%80%94%20Faceless%20YouTube%20Production%20Architecture%202026%2B/14-ASTHORTERA-BALL-TV-SEASON-AND-P7-INTEGRATION.md): upstream production targets and acceptance gates.

Existing *The Abyss of Comfort* season numbering remains independent. Phantomkind and Cosmeilian species-centered characters are **deferred for this program**, not removed from Asthortera canon. P7A contains **no** named-nation 3D meshes; P7B will implement that adapter using the unchanged P6 rig.

## Layout

```text
src/production/contracts/
  types.ts       TypeScript schema and story/release status
  validate.ts    Strict runtime parse + cross-manifest identity validation
  index.ts       Public P7A API
episodes/landscape/asthortera-ball/
  program.json
  season-01/season.json
  season-01/episodes/ep-001/episode.json
studio/scripts/production/validate-p7a.ts
tests/p7a-contracts.test.ts
```

Do not duplicate story text, canonical facts or SHA pins across three manifests. `program.sourceRegistry` holds a **single pinned source table**. `season.sourceKeys` and `episode.sourceKeys` reference those keys. The fixture pins explicit 40-character commit SHA values; a branch name or `PIN_AT_BUILD` fails validation.

## Run in PowerShell 5.1

From `PS C:/Projects/claude-animated-shorts-engineering>`:

```powershell
git fetch origin
git switch feat/p7a-program-season-episode-contracts
npm ci
npm run p7a:validate
npm run p7a:test
npm run typecheck
npm test
npm run build
```

`npm ci` uses the **existing lockfile**; no dependency or lockfile version is changed. On the first run on a new machine, npm may need to download dependencies under the existing npm workspace; it does not call paid video APIs.

The CLI is **read-only** and prints its PASS/FAIL result; `npm run p7a:validate -- --json` gives a machine-readable summary. Scripts never alter canon or write renders.

## Contracts

- **Program:** immutable `programId`, `seriesCode`, universe, default 16:9 1920×1080/30fps profile, `characterPerformanceProfileId` referencing **countryball-3d-p6**, pinned source registry, declared seasons.
- **Season:** independent season ID/ordinal, status, source-key references, first episode ID and ordered episode list. Not a second franchise bible.
- **Episode:** linked program/season ID, ordinal, development-only story status, cast IDs, narrative modes, scene ID references, and **independent technical/creative/canon/publication gates**.

`episode.sceneIds = []` is intentionally permitted for an unfinished development fixture. This does **not** invent shot lengths, dialogue or a rendered scene. Setting an episode to `production-candidate` without scene IDs fails validation.

Identity format: season `{seriesCode}-S##`, episode `{seasonId}E##`. Season opening is the first declared episode; supplied episode manifests must match exactly. Duplicate IDs and unregistered source keys fail.

## Intentional safety gates

- Reject unknown schema fields and unsupported status/mode values.
- Reject unsafe source paths, duplicate source targets and revisions that are not full Git SHAs.
- Reject broken program/season/episode links, wrong ordinals, missing episode files, duplicates and opening changes.
- Reject unreviewed release, illegal development-material freeze and published-canon claims lacking technical/creative approval.
- Keep technical validation **separate** from owner creative approval. An automated PASS does not authorize a change in published lore or upload a video.

## Non-goals and future handoff

**P7A ends at contracts and validation.** P7B should add a versioned nation-profile adapter to the existing `WhiteBall3DRig` and a small 16:9 render proof, without changing these manifest identities or importing species-centered rigs. P7C can compile `sceneIds` into existing scene/audio contracts rather than creating a parallel renderer.

All P3–P6 compositions, `src/npc/white-ball-3d/`, `src/pilot/archive/`, `templates/**`, `references/**`, existing audio/WAV/MP4 outputs and `package-lock.json` are intentionally preserved.

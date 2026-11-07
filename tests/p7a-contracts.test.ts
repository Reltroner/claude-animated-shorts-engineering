/** P7A contracts: data integrity, authority, stable IDs, and deliberately blocked release. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEpisode, parseProgram, parseSeason, P7AContractError, validateP7AHierarchy } from '../src/production/contracts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'episodes/landscape/asthortera-ball');
const read = (file: string): unknown => JSON.parse(readFileSync(path.join(fixture, file), 'utf8')) as unknown;
const program = read('program.json');
const season = read('season-01/season.json');
const episode = read('season-01/episodes/ep-001/episode.json');
const clone = <T>(value: T): T => structuredClone(value);
const expectInvalid = (fn: () => unknown, reason: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof P7AContractError && reason.test(error.message));

test('P7A: canonical fixture parses and resolves program -> season -> episode', () => {
  const hierarchy = validateP7AHierarchy(program, season, [episode]);
  assert.equal(hierarchy.program.programId, 'asthortera-ball');
  assert.equal(hierarchy.program.seriesCode, 'AB-TV');
  assert.equal(hierarchy.season.seasonId, 'AB-TV-S01');
  assert.equal(hierarchy.episodes[0].episodeId, 'AB-TV-S01E01');
  assert.equal(hierarchy.season.openingEpisodeId, hierarchy.episodes[0].episodeId);
  assert.equal(hierarchy.episodes[0].workingTitle, 'The Pencilfania Problem');
});

test('P7A: landscape 30 FPS and P6 profile are references, not a rewritten renderer', () => {
  const p = parseProgram(program);
  assert.deepEqual(p.defaultFormat, { id: 'landscape-1080p', width: 1920, height: 1080, fps: 30 });
  assert.equal(p.characterPerformanceProfileId, 'countryball-3d-p6');
  assert.equal(p.castScope, 'countryball-civilizations');
});

test('P7A: S1E1 cast follows current Pencilfania opening, not a proposed Pasgerflit rewrite', () => {
  const e = parseEpisode(episode);
  assert.deepEqual([...e.castIds], ['henchowayball', 'pencilfaniaball', 'reltronlandball']);
  assert.ok(!e.castIds.some((id) => /phantomkind|cosmeilian/.test(id)), 'species-centered cast deferred');
  assert.deepEqual([...e.narrativeModes], ['current-lore']);
  assert.deepEqual([...e.sceneIds], [], 'no invented scenes or frame timing in P7A');
});

test('P7A: every source is pinned at a full commit SHA, registered once, and referenced by key', () => {
  const p = parseProgram(program);
  const s = parseSeason(season);
  const e = parseEpisode(episode);
  assert.ok(Object.keys(p.sourceRegistry).length >= 3);
  for (const ref of Object.values(p.sourceRegistry)) {
    assert.match(ref.revision, /^[a-f0-9]{40}$/);
    assert.match(ref.repository, /^Reltroner\//);
  }
  for (const key of [...s.sourceKeys, ...e.sourceKeys]) assert.ok(key in p.sourceRegistry, key);
});

test('P7A: no canon freeze, fake technical acceptance, or publication in development fixture', () => {
  const e = parseEpisode(episode);
  assert.equal(e.storyStatus, 'development-material');
  assert.deepEqual(e.approval, {
    technical: 'pending',
    creative: 'pending',
    canonFreeze: false,
    publication: 'blocked',
  });
});

test('P7A negative: no unpinned/branch source references', () => {
  const p = clone(program) as Record<string, any>;
  p.sourceRegistry.franchiseBible.revision = 'main';
  expectInvalid(() => parseProgram(p), /revision/);
});

test('P7A negative: reject unsafe traversal in source paths', () => {
  const p = clone(program) as Record<string, any>;
  p.sourceRegistry.franchiseBible.path = '../secrets';
  expectInvalid(() => parseProgram(p), /path/);
});

test('P7A negative: duplicate source registry targets are not valid', () => {
  const p = clone(program) as Record<string, any>;
  p.sourceRegistry.extra = clone(p.sourceRegistry.franchiseBible);
  expectInvalid(() => parseProgram(p), /duplicate source target/);
});

test('P7A negative: unknown manifest fields are rejected, not silently accepted', () => {
  const e = clone(episode) as Record<string, unknown>;
  e.automaticPublication = true;
  expectInvalid(() => parseEpisode(e), /unknown field/);
});

test('P7A negative: source keys must resolve to program-scoped pins', () => {
  const e = clone(episode) as Record<string, any>;
  e.sourceKeys.push('imaginaryCanon');
  expectInvalid(() => validateP7AHierarchy(program, season, [e]), /unknown sourceKey/);
});

test('P7A negative: the countryball program rejects species-centered cast IDs', () => {
  const e = clone(episode) as Record<string, any>;
  e.castIds.push('phantomkind');
  expectInvalid(() => validateP7AHierarchy(program, season, [e]), /cast outside countryball scope/);
});

test('P7A negative: inherited keys are not accepted as registered canon source references', () => {
  const e = clone(episode) as Record<string, any>;
  e.sourceKeys.push('constructor');
  expectInvalid(() => validateP7AHierarchy(program, season, [e]), /unknown sourceKey/);
});

test('P7A negative: wrong season link cannot cross a program boundary', () => {
  const s = clone(season) as Record<string, unknown>;
  s.programId = 'other-program';
  expectInvalid(() => validateP7AHierarchy(program, s, [episode]), /season.programId/);
});

test('P7A negative: season identity is derived from program code and ordinal', () => {
  const s = clone(season) as Record<string, unknown>;
  s.seasonNumber = 2;
  expectInvalid(() => validateP7AHierarchy(program, s, [episode]), /season.seasonId/);
});

test('P7A negative: existing S1E1 cannot be silently replaced as season opening', () => {
  const s = clone(season) as Record<string, unknown>;
  s.openingEpisodeId = 'AB-TV-S01E02';
  expectInvalid(() => parseSeason(s), /openingEpisodeId/);
});

test('P7A negative: episode number cannot disagree with its stable episode ID', () => {
  const e = clone(episode) as Record<string, unknown>;
  e.episodeNumber = 2;
  expectInvalid(() => validateP7AHierarchy(program, season, [e]), /wrong episode ID/);
});

test('P7A negative: no missing, extra, or duplicate episode manifests', () => {
  expectInvalid(() => validateP7AHierarchy(program, season, []), /count differs/);
  expectInvalid(() => validateP7AHierarchy(program, season, [episode, episode]), /duplicate/);
});

test('P7A negative: duplicate cast members and invalid narrative modes are refused', () => {
  const e = clone(episode) as Record<string, any>;
  e.castIds.push('pencilfaniaball');
  e.narrativeModes.push('freewheeling-lore');
  expectInvalid(() => parseEpisode(e), /duplicate/);
  expectInvalid(() => parseEpisode(e), /unknown value/);
});

test('P7A negative: development material cannot be published or frozen', () => {
  const e = clone(episode) as Record<string, any>;
  e.approval.publication = 'approved';
  e.approval.canonFreeze = true;
  expectInvalid(() => parseEpisode(e), /publication requires/);
});

test('P7A negative: published-canon status cannot be asserted with blocked publication', () => {
  const e = clone(episode) as Record<string, unknown>;
  e.storyStatus = 'published-canon';
  expectInvalid(() => parseEpisode(e), /published-canon requires publication approval/);
});

test('P7A negative: production candidate cannot have an empty scene list', () => {
  const e = clone(episode) as Record<string, unknown>;
  e.storyStatus = 'production-candidate';
  expectInvalid(() => parseEpisode(e), /needs scene IDs/);
});

test('P7A: duplicate source keys and unsafe unknown program fields fail', () => {
  const s = clone(season) as Record<string, any>;
  s.sourceKeys.push('masterConstitution');
  expectInvalid(() => parseSeason(s), /duplicate/);
  const p = clone(program) as Record<string, any>;
  p.hiddenAgentInstruction = true;
  expectInvalid(() => parseProgram(p), /unknown field/);
});

import {
  P7A_SCHEMA_VERSION,
  type EpisodeApproval,
  type EpisodeManifest,
  type P7AHierarchy,
  type ProgramManifest,
  type SeasonManifest,
  type SourcePin,
  type StoryStatus,
} from './types';

export class P7AContractError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super('P7A contract invalid:\n' + issues.map((issue) => ' - ' + issue).join('\n'));
    this.name = 'P7AContractError';
  }
}

const STORY_STATUSES = new Set<string>([
  'concept', 'development-material', 'planned-forward-architecture',
  'structured-canon', 'production-candidate', 'published-canon',
  'superseded-archived-draft',
]);
const SOURCE_AUTHORITIES = new Set(['master', 'franchise', 'character', 'production']);
const NARRATIVE_MODES = new Set(['current-lore', 'backstory', 'wiki']);
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SERIES_CODE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const KEY = /^[a-z][a-zA-Z0-9]*$/;
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?!.*\/\/)[A-Za-z0-9_. /+-]+$/;

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function object(v: unknown, where: string, allowed: readonly string[], errors: string[]): Obj {
  if (!obj(v)) {
    errors.push(where + ': expected object');
    return {};
  }
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) errors.push(where + '.' + key + ': unknown field');
  }
  for (const key of allowed) {
    if (!(key in v)) errors.push(where + '.' + key + ': missing field');
  }
  return v;
}

function str(v: unknown, where: string, errors: string[], pattern?: RegExp): string {
  if (typeof v !== 'string' || v.trim() !== v || v.length === 0 || (pattern && !pattern.test(v))) {
    errors.push(where + ': invalid non-empty string');
    return '';
  }
  return v;
}

function literal(v: unknown, expected: string, where: string, errors: string[]): void {
  if (v !== expected) errors.push(where + ': expected ' + expected);
}

function positive(v: unknown, where: string, errors: string[], max = 999999): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1 || v > max) {
    errors.push(where + ': expected positive safe integer');
    return 0;
  }
  return v;
}

function uniqueStrings(
  v: unknown, where: string, errors: string[],
  pattern: RegExp, min = 0, allowed?: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(v)) {
    errors.push(where + ': expected array');
    return [];
  }
  if (v.length < min) errors.push(where + ': expected at least ' + min + ' item(s)');
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < v.length; i++) {
    const item = str(v[i], where + '[' + i + ']', errors, pattern);
    if (!item) continue;
    if (seen.has(item)) errors.push(where + ': duplicate ' + item);
    if (allowed && !allowed.has(item)) errors.push(where + ': unknown value ' + item);
    seen.add(item);
    out.push(item);
  }
  return out;
}

function storyStatus(v: unknown, where: string, errors: string[]): StoryStatus {
  const s = str(v, where, errors);
  if (s && !STORY_STATUSES.has(s)) errors.push(where + ': unsupported status ' + s);
  return s as StoryStatus;
}

function sourceRegistry(v: unknown, errors: string[]): Readonly<Record<string, SourcePin>> {
  if (!obj(v) || Object.keys(v).length === 0) {
    errors.push('program.sourceRegistry: expected non-empty object');
    return {};
  }
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(v)) {
    str(key, 'program.sourceRegistry key', errors, KEY);
    const at = 'program.sourceRegistry.' + key;
    const s = object(raw, at, ['repository', 'path', 'revision', 'authority'], errors);
    const repo = str(s.repository, at + '.repository', errors, REPO);
    const path = str(s.path, at + '.path', errors, SAFE_PATH);
    str(s.revision, at + '.revision', errors, SHA);
    const authority = str(s.authority, at + '.authority', errors);
    if (authority && !SOURCE_AUTHORITIES.has(authority)) errors.push(at + ': invalid authority');
    const identity = repo + '/' + path;
    if (seen.has(identity)) errors.push(at + ': duplicate source target');
    seen.add(identity);
  }
  return v as Readonly<Record<string, SourcePin>>;
}

function finish<T>(raw: unknown, errors: string[]): T {
  if (errors.length) throw new P7AContractError(errors);
  return raw as T;
}

export function parseProgram(raw: unknown): ProgramManifest {
  const errors: string[] = [];
  const p = object(raw, 'program', [
    'schemaVersion', 'kind', 'programId', 'seriesCode', 'title',
    'universeId', 'characterPerformanceProfileId', 'defaultFormat',
    'sourceRegistry', 'seasonIds',
  ], errors);
  literal(p.schemaVersion, P7A_SCHEMA_VERSION, 'program.schemaVersion', errors);
  literal(p.kind, 'program', 'program.kind', errors);
  str(p.programId, 'program.programId', errors, ID);
  str(p.seriesCode, 'program.seriesCode', errors, SERIES_CODE);
  str(p.title, 'program.title', errors);
  str(p.universeId, 'program.universeId', errors, ID);
  str(p.characterPerformanceProfileId, 'program.characterPerformanceProfileId', errors, ID);
  const f = object(p.defaultFormat, 'program.defaultFormat', ['id', 'width', 'height', 'fps'], errors);
  str(f.id, 'program.defaultFormat.id', errors, ID);
  positive(f.width, 'program.defaultFormat.width', errors, 16384);
  positive(f.height, 'program.defaultFormat.height', errors, 16384);
  positive(f.fps, 'program.defaultFormat.fps', errors, 120);
  if (typeof f.width === 'number' && f.width % 2 !== 0) errors.push('program.defaultFormat.width: must be even');
  if (typeof f.height === 'number' && f.height % 2 !== 0) errors.push('program.defaultFormat.height: must be even');
  sourceRegistry(p.sourceRegistry, errors);
  uniqueStrings(p.seasonIds, 'program.seasonIds', errors, SERIES_CODE, 1);
  return finish<ProgramManifest>(raw, errors);
}

export function parseSeason(raw: unknown): SeasonManifest {
  const errors: string[] = [];
  const s = object(raw, 'season', [
    'schemaVersion', 'kind', 'programId', 'seasonId', 'seasonNumber',
    'workingTitle', 'storyStatus', 'sourceKeys', 'openingEpisodeId', 'episodeIds',
  ], errors);
  literal(s.schemaVersion, P7A_SCHEMA_VERSION, 'season.schemaVersion', errors);
  literal(s.kind, 'season', 'season.kind', errors);
  str(s.programId, 'season.programId', errors, ID);
  str(s.seasonId, 'season.seasonId', errors, SERIES_CODE);
  positive(s.seasonNumber, 'season.seasonNumber', errors, 99);
  str(s.workingTitle, 'season.workingTitle', errors);
  storyStatus(s.storyStatus, 'season.storyStatus', errors);
  uniqueStrings(s.sourceKeys, 'season.sourceKeys', errors, KEY, 1);
  str(s.openingEpisodeId, 'season.openingEpisodeId', errors, SERIES_CODE);
  const episodes = uniqueStrings(s.episodeIds, 'season.episodeIds', errors, SERIES_CODE, 1);
  if (episodes.length && episodes[0] !== s.openingEpisodeId) errors.push('season.openingEpisodeId: must be first listed episode');
  return finish<SeasonManifest>(raw, errors);
}

function approval(raw: unknown, story: StoryStatus, errors: string[]): void {
  const a = object(raw, 'episode.approval', ['technical', 'creative', 'canonFreeze', 'publication'], errors);
  if (!['pending', 'pass', 'fail'].includes(String(a.technical))) errors.push('episode.approval.technical: invalid');
  if (!['pending', 'approved', 'revise'].includes(String(a.creative))) errors.push('episode.approval.creative: invalid');
  if (typeof a.canonFreeze !== 'boolean') errors.push('episode.approval.canonFreeze: expected boolean');
  if (!['blocked', 'approved'].includes(String(a.publication))) errors.push('episode.approval.publication: invalid');
  if (a.canonFreeze === true && a.creative !== 'approved') errors.push('episode.approval: cannot freeze canon without creative approval');
  if (a.publication === 'approved' && (a.canonFreeze !== true || a.creative !== 'approved' || a.technical !== 'pass' || story !== 'published-canon')) {
    errors.push('episode.approval: publication requires published-canon, freeze, creative approval and technical PASS');
  }
  if (story === 'published-canon' && a.publication !== 'approved') errors.push('episode.storyStatus: published-canon requires publication approval');
  if (story === 'development-material' && (a.canonFreeze === true || a.publication === 'approved')) errors.push('episode.storyStatus: development material cannot be released or frozen');
}

export function parseEpisode(raw: unknown): EpisodeManifest {
  const errors: string[] = [];
  const e = object(raw, 'episode', [
    'schemaVersion', 'kind', 'programId', 'seasonId', 'episodeId', 'episodeNumber',
    'workingTitle', 'storyStatus', 'sourceKeys', 'castIds', 'narrativeModes',
    'sceneIds', 'approval',
  ], errors);
  literal(e.schemaVersion, P7A_SCHEMA_VERSION, 'episode.schemaVersion', errors);
  literal(e.kind, 'episode', 'episode.kind', errors);
  str(e.programId, 'episode.programId', errors, ID);
  str(e.seasonId, 'episode.seasonId', errors, SERIES_CODE);
  str(e.episodeId, 'episode.episodeId', errors, SERIES_CODE);
  positive(e.episodeNumber, 'episode.episodeNumber', errors, 99);
  str(e.workingTitle, 'episode.workingTitle', errors);
  const status = storyStatus(e.storyStatus, 'episode.storyStatus', errors);
  uniqueStrings(e.sourceKeys, 'episode.sourceKeys', errors, KEY, 1);
  uniqueStrings(e.castIds, 'episode.castIds', errors, ID, 1);
  uniqueStrings(e.narrativeModes, 'episode.narrativeModes', errors, ID, 1, NARRATIVE_MODES);
  const scenes = uniqueStrings(e.sceneIds, 'episode.sceneIds', errors, SERIES_CODE);
  approval(e.approval, status, errors);
  if (status === 'production-candidate' && scenes.length === 0) errors.push('episode.sceneIds: a production candidate needs scene IDs');
  return finish<EpisodeManifest>(raw, errors);
}

const numbered = (n: number) => String(n).padStart(2, '0');

/** Validate the references and exact identities; never infer or ratify a new story. */
export function validateP7AHierarchy(programRaw: unknown, seasonRaw: unknown, episodeRaws: readonly unknown[]): P7AHierarchy {
  const program = parseProgram(programRaw);
  const season = parseSeason(seasonRaw);
  const episodes = episodeRaws.map(parseEpisode);
  const issues: string[] = [];
  if (season.programId !== program.programId) issues.push('season.programId: does not match program');
  if (season.seasonId !== program.seriesCode + '-S' + numbered(season.seasonNumber)) issues.push('season.seasonId: does not match program seriesCode/seasonNumber');
  if (!program.seasonIds.includes(season.seasonId)) issues.push('program.seasonIds: missing season ' + season.seasonId);
  if (episodeRaws.length !== season.episodeIds.length) issues.push('season.episodeIds: count differs from provided episode manifests');
  const seen = new Set<string>();
  for (const ep of episodes) {
    if (seen.has(ep.episodeId)) issues.push('episode.episodeId: duplicate ' + ep.episodeId);
    seen.add(ep.episodeId);
    if (ep.programId !== program.programId) issues.push(ep.episodeId + ': wrong programId');
    if (ep.seasonId !== season.seasonId) issues.push(ep.episodeId + ': wrong seasonId');
    if (ep.episodeId !== season.seasonId + 'E' + numbered(ep.episodeNumber)) issues.push(ep.episodeId + ': wrong episode ID/number');
    if (!season.episodeIds.includes(ep.episodeId)) issues.push(ep.episodeId + ': not declared in season.episodeIds');
    for (const key of ep.sourceKeys) if (!(key in program.sourceRegistry)) issues.push(ep.episodeId + ': unknown sourceKey ' + key);
  }
  for (const id of season.episodeIds) if (!seen.has(id)) issues.push('season.episodeIds: manifest missing ' + id);
  for (const key of season.sourceKeys) if (!(key in program.sourceRegistry)) issues.push('season: unknown sourceKey ' + key);
  if (issues.length) throw new P7AContractError(issues);
  return { program, season, episodes: season.episodeIds.map((id) => episodes.find((e) => e.episodeId === id)!) };
}

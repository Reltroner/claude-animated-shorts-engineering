/** Read-only P7A loader. Run from the repository root: npm run p7a:validate. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProgram, parseSeason, validateP7AHierarchy } from '../../../src/production/contracts';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const defaultRelative = 'episodes/landscape/asthortera-ball';
const requested = process.argv[2] && process.argv[2] !== '--json' ? process.argv[2] : defaultRelative;
const dir = path.resolve(root, requested);
const jsonOutput = process.argv.includes('--json');

function readJson(file: string): unknown {
  const absolute = path.resolve(file);
  if (!absolute.startsWith(dir + path.sep)) throw new Error('P7A file escapes manifest directory: ' + file);
  return JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
}

try {
  if (!dir.startsWith(root + path.sep)) throw new Error('P7A manifest directory must be under repository root');
  const program = parseProgram(readJson(path.join(dir, 'program.json')));
  let episodes = 0;
  const seasons: { id: string; opening: string; episodes: number }[] = [];
  for (const seasonId of program.seasonIds) {
    const match = /-S([0-9]{2})$/.exec(seasonId);
    if (!match) throw new Error('Invalid season path identity: ' + seasonId);
    const seasonDir = path.join(dir, 'season-' + match[1]);
    const season = parseSeason(readJson(path.join(seasonDir, 'season.json')));
    const inputs = season.episodeIds.map((id) => {
      const m = /E([0-9]{2})$/.exec(id);
      if (!m) throw new Error('Invalid episode path identity: ' + id);
      return readJson(path.join(seasonDir, 'episodes', 'ep-' + m[1].padStart(3, '0'), 'episode.json'));
    });
    const result = validateP7AHierarchy(program, season, inputs);
    episodes += result.episodes.length;
    seasons.push({ id: season.seasonId, opening: season.openingEpisodeId, episodes: result.episodes.length });
  }
  const summary = {
    result: 'PASS',
    contract: 'P7A',
    programId: program.programId,
    performanceProfile: program.characterPerformanceProfileId,
    format: program.defaultFormat,
    seasons,
    episodeCount: episodes,
    releaseAuthority: 'human review required; manifests are not published canon',
  };
  if (jsonOutput) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  else {
    process.stdout.write('P7A CONTRACT VALIDATION: PASS\n');
    process.stdout.write('Program: ' + program.programId + ' | seasons: ' + seasons.length + ' | episodes: ' + episodes + '\n');
    for (const s of seasons) process.stdout.write(s.id + ' opening=' + s.opening + ' episodes=' + s.episodes + '\n');
    process.stdout.write('No rendering, canon freeze, or publication performed.\n');
  }
} catch (error) {
  process.stderr.write('P7A CONTRACT VALIDATION: FAIL\n');
  process.stderr.write(String(error instanceof Error ? error.message : error) + '\n');
  process.exitCode = 1;
}

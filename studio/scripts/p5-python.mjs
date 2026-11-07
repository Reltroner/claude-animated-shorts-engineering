// Runs a P5 Python script in the private venv under .local/p5-white-ball/.venv, which keeps the system Python untouched.
//   node studio/scripts/p5-python.mjs --setup          create the venv and install studio/audio/requirements.txt
//   node studio/scripts/p5-python.mjs <script.py> ...  run a script from the repository root
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const venv = path.join(root, '.local', 'p5-white-ball', '.venv');
const python = process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.error) throw r.error;
  return r.status ?? 1;
};
if (process.argv[2] === '--setup') {
  fs.mkdirSync(path.dirname(venv), { recursive: true });
  let status = run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'venv', venv]);
  if (status === 0) status = run(python, ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', '-r', path.join('studio', 'audio', 'requirements.txt')]);
  process.exit(status);
}
if (!fs.existsSync(python)) {
  console.error('The P5 Python environment is missing. Run: npm run p5:venv');
  process.exit(1);
}
process.exit(run(python, process.argv.slice(2)));

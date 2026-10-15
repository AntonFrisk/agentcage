// Process helpers. Arguments are always passed as arrays (no shell), so paths never get mangled.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const fail = (cmd, args, code, err) =>
  new Error(`${cmd} ${args.join(' ')} failed (exit ${code})${err ? ':\n' + err.trim().split('\n').slice(-15).join('\n') : ''}`);

// Quick commands: returns trimmed stdout ('' if the command is missing and check is off)
export function runSync(cmd, args = [], { check = false, input } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input });
  if (check && r.status !== 0) throw fail(cmd, args, r.status, r.stderr || r.error?.message);
  return (r.stdout || '').trim();
}
export const ok = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;

// Long-running commands (keeps spinners animating). input: string sent on stdin; tty: hand over the terminal
export const run = (cmd, args = [], { input, env, tty } = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: tty ? 'inherit' : 'pipe' });
  let out = '', err = '';
  p.stdout?.on('data', d => (out += d));
  p.stderr?.on('data', d => (err += d));
  p.on('error', e => reject(new Error(`${cmd}: ${e.message}`)));
  p.on('close', code => (code === 0 ? resolve(out.trim()) : reject(fail(cmd, args, code, err || out))));
  if (input !== undefined) p.stdin.end(input); else p.stdin?.end();
});

// Bundled @devcontainers/cli, so users don't need to install it
const DC = join(dirname(createRequire(import.meta.url).resolve('@devcontainers/cli/package.json')), 'devcontainer.js');
export const devcontainer = args => run(process.execPath, [DC, ...args]);

// IDE launchers (cursor, code) are .cmd shims on Windows and need a shell there
export function launch(cmd, args) {
  const win = process.platform === 'win32';
  const line = [cmd, ...args].map(a => (/[\s&|<>^]/.test(a) ? `"${a}"` : a)).join(' ');
  return spawn(win ? line : cmd, win ? [] : args, { shell: win, stdio: 'ignore', detached: true }).unref();
}

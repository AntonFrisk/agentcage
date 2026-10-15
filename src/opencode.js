// OpenCode Desktop on the host: where it lives, its version, whether it runs, and registering boxes in it.
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ok, run, runSync } from './run.js';

const P = process.platform, H = homedir(), E = process.env;
const DATA_DIR = P === 'win32' ? join(E.APPDATA ?? '', 'ai.opencode.desktop')
  : P === 'darwin' ? join(H, 'Library', 'Application Support', 'ai.opencode.desktop')
  : join(E.XDG_CONFIG_HOME || join(H, '.config'), 'ai.opencode.desktop');
// Folders holding the app's bundled opencode-cli.version (Windows verified; macOS/Linux are best guesses)
const RESOURCE_DIRS = P === 'win32' ? [join(E.LOCALAPPDATA ?? '', 'Programs', '@opencodedesktop', 'resources')]
  : P === 'darwin' ? ['/Applications/OpenCode.app/Contents/Resources', join(H, 'Applications/OpenCode.app/Contents/Resources')]
  : ['/opt/OpenCode/resources', '/usr/lib/opencode-desktop/resources', '/usr/lib/OpenCode/resources', '/opt/opencode-desktop/resources'];

const SEMVER = /^\d+\.\d+\.\d+$/;
const cmp = (a, b) => a.split('.').reduce((r, x, i) => r || x - b.split('.')[i], 0);

export function detectDesktop() {
  const db = join(DATA_DIR, 'drafts.sqlite');
  const file = RESOURCE_DIRS.map(d => join(d, 'opencode-cli.version')).find(existsSync);
  const cliDir = join(DATA_DIR, 'cli');
  let version = file && readFileSync(file, 'utf8').trim(), from = file;
  if (!version && existsSync(cliDir)) [version, from] = [readdirSync(cliDir).filter(v => SEMVER.test(v)).sort(cmp).at(-1), cliDir];
  if (!version) [version, from] = [runSync('opencode', ['--version']).match(/\d+\.\d+\.\d+/)?.[0], 'opencode on PATH'];
  return { dataDir: DATA_DIR, db, hasDb: existsSync(db), version, from };
}

export const desktopRunning = () => P === 'win32'
  ? /^OpenCode\.exe/im.test(runSync('tasklist', ['/FI', 'IMAGENAME eq OpenCode.exe', '/NH']))
  : ok('pgrep', ['-x', 'OpenCode']);

export const latestVersion = async () => (await (await fetch('https://registry.npmjs.org/@opencode/cli/latest')).json()).version;

// Desktop has no API or deep link for adding a server, so write its state DB (app must be closed). A backup is kept.
export async function connectDesktop(box) {
  const { db, hasDb } = detectDesktop();
  if (!hasDb) throw new Error(`OpenCode Desktop state not found at ${db}. Open the app once first.`);
  if (desktopRunning()) throw new Error('OpenCode Desktop is running. Close it first.');
  copyFileSync(db, db + '.agentcage-backup');
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(db), url = `http://127.0.0.1:${box.port}`, dir = `/workspaces/${box.name}`;
  const row = d.prepare("select value from state where name='opencode.global.dat' and key='server'").get();
  const s = { list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {}, ...(row && JSON.parse(row.value)) };
  const urlOf = x => (typeof x === 'string' ? x : x.http?.url ?? x.url);
  s.list = s.list.filter(x => urlOf(x) !== url).concat({ type: 'http', http: { url, password: box.password }, displayName: `agentcage: ${box.name}` });
  s.projects[url] = [{ worktree: dir, expanded: true }];
  s.lastProject[url] = dir;
  d.prepare(`insert into state(name, key, value, updated_at) values ('opencode.global.dat', 'server', ?, ?)
    on conflict(name, key) do update set value = excluded.value, updated_at = excluded.updated_at`).run(JSON.stringify(s), Date.now());
  d.close();
}

// OpenCode only reads API keys from an interactive terminal, so hand the terminal to its own prompt inside the box.
// The key goes straight into the box's home volume and never passes through agentcage or the host.
export const loginProvider = (box, provider) =>
  run('docker', ['exec', '-it', '-u', 'node', '-w', '/tmp', box.container, 'opencode', 'auth', 'login', provider, '--method', 'key'], { tty: true });

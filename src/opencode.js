// OpenCode Desktop on the host: where it lives, its version, whether it runs, and registering containers in it.
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectIcon } from './icon.js';
import { ok, run, runSync } from './run.js';
import { loadSettings } from './settings.js';

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
export async function connectDesktop(container) {
  const { db, hasDb } = detectDesktop();
  if (!hasDb) throw new Error(`OpenCode Desktop state not found at ${db}. Open the app once first.`);
  if (desktopRunning()) throw new Error('OpenCode Desktop is running. Close it first.');
  copyFileSync(db, db + '.agentcage-backup');
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(db), url = `http://127.0.0.1:${container.port}`, dir = `/workspaces/${container.name}`;
  const row = d.prepare("select value from state where name='opencode.global.dat' and key='server'").get();
  const s = { list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {}, ...(row && JSON.parse(row.value)) };
  const urlOf = x => (typeof x === 'string' ? x : x.http?.url ?? x.url);
  s.list = s.list.filter(x => urlOf(x) !== url).concat({ type: 'http', http: { url, password: container.password }, displayName: serverName(container) });
  s.projects[url] = [{ worktree: dir, expanded: true }];
  s.lastProject[url] = dir;
  d.prepare(`insert into state(name, key, value, updated_at) values ('opencode.global.dat', 'server', ?, ?)
    on conflict(name, key) do update set value = excluded.value, updated_at = excluded.updated_at`).run(JSON.stringify(s), Date.now());
  d.close();
}

// Names stored at creation; containers made before the settings existed use the current settings
export const serverName = c => c.serverName ?? loadSettings().serverPrefix + c.name;

// Sets the project's name and its generated icon in the container's OpenCode server. Asking about the folder creates the project first.
// The server starts in the background after `devcontainer up`, so retry for ~30 s.
export async function setupProject(c) {
  const s = loadSettings(), name = c.projectName ?? s.projectPrefix + c.name, color = c.color ?? s.color;
  const base = `http://127.0.0.1:${c.port}/api`, dir = `/workspaces/${c.name}`;
  const api = (path, init) => fetch(base + path, { ...init, headers: { authorization: `Basic ${Buffer.from(`opencode:${c.password}`).toString('base64')}`, 'content-type': 'application/json' } })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`OpenCode API ${path}: HTTP ${r.status}`))));
  for (let i = 0; ; i++) {
    try {
      await api(`/vcs?location[directory]=${encodeURIComponent(dir)}`);
      const { id } = (await api('/project')).find(x => x.canonical === dir);
      return await api(`/project/${id}`, { method: 'PATCH', body: JSON.stringify({ name, icon: { color, override: projectIcon(c.name, s.projectPrefix) } }) });
    } catch (e) { if (i >= 15) throw e; await new Promise(r => setTimeout(r, 2000)); }
  }
}

// OpenCode only reads API keys from an interactive terminal, so hand the terminal to its own prompt inside the container.
// The key goes straight into the container's home volume and never passes through agentcage or the host.
export const loginProvider = (container, provider) =>
  run('docker', ['exec', '-it', '-u', 'node', '-w', '/tmp', container.container, 'opencode', 'auth', 'login', provider, '--method', 'key'], { tty: true });

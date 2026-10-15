// Container state (~/.agentcage/<name>/container.json), devcontainer.json generation and the container lifecycle.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { devcontainer, launch, ok, run, runSync } from './run.js';
import { TOOLS } from './catalog.js';
import { copyIdentity, isGitUrl, parseRemote, seed, setupToken } from './git.js';

export const ROOT = join(homedir(), '.agentcage');
const TEMPLATE = fileURLToPath(new URL('../template/', import.meta.url));
// Configs from before the box -> container rename are moved to container.json on first access
const cfgFile = name => {
  const f = join(ROOT, name, 'container.json'), old = join(ROOT, name, 'box.json');
  if (!existsSync(f) && existsSync(old)) renameSync(old, f);
  return f;
};
export const ws = b => `/workspaces/${b.name}`;

export const hasContainer = name => existsSync(cfgFile(name));
export function loadContainer(name) {
  if (!hasContainer(name)) throw new Error(`No container named '${name}'. See: agentcage list`);
  return JSON.parse(readFileSync(cfgFile(name), 'utf8'));
}
export function saveContainer(b) {
  mkdirSync(join(ROOT, b.name), { recursive: true });
  writeFileSync(cfgFile(b.name), JSON.stringify(b, null, 2));
}
export const listContainers = () => (existsSync(ROOT) ? readdirSync(ROOT).filter(hasContainer).map(loadContainer) : []);

export const cleanName = s => 'ac-' + s.replace(/\.git\/?$/, '').replace(/[\\/:]+$/, '').replace(/.*[:\\/]/, '')
  .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
export const nameTaken = n => hasContainer(n) || ok('docker', ['inspect', n]) || ok('docker', ['volume', 'inspect', `${n}-src`]);

const bindable = port => new Promise(r => {
  const s = createServer().once('error', () => r(false)).listen(port, '127.0.0.1', () => s.close(() => r(true)));
});
async function freePort() {
  const used = new Set(listContainers().map(b => b.port));
  for (const m of runSync('docker', ['ps', '-a', '--format', '{{.Ports}}']).matchAll(/:(\d+)->/g)) used.add(+m[1]);
  for (let p = 4100; ; p++) if (!used.has(p) && (await bindable(p))) return p;
}

export function writeDevcontainer(b) {
  const dir = join(b.dir, '.devcontainer'), oc = b.tools.includes('opencode');
  const tools = TOOLS.filter(t => b.tools.includes(t.id));
  mkdirSync(dir, { recursive: true });
  cpSync(TEMPLATE, dir, { recursive: true });
  // Isolation: the source lives in a Docker volume, not a bind mount. No host paths, no Docker socket, not privileged.
  const cfg = {
    name: b.name,
    build: { dockerfile: 'Dockerfile', args: { OPENCODE_VERSION: oc ? b.opencodeVersion : '', NPM_GLOBALS: tools.flatMap(t => t.npm ?? []).join(' ') } },
    workspaceMount: `source=${b.volumes.src},target=${ws(b)},type=volume`,
    workspaceFolder: ws(b),
    mounts: [`source=${b.volumes.home},target=/home/node,type=volume`],
    runArgs: [`--name=${b.container}`, `--label=agentcage.name=${b.name}`, ...(oc ? ['-p', `127.0.0.1:${b.port}:4096`] : [])],
    containerEnv: oc ? { OPENCODE_SERVER_PASSWORD: b.password } : {},
    features: Object.fromEntries(tools.filter(t => t.feature).map(t => [t.feature, {}])),
    remoteUser: 'node',
    init: true,
    forwardPorts: [3000],
    postCreateCommand: 'agentcage-post-create',
    ...(oc && { postStartCommand: 'setsid nohup opencode serve --hostname 0.0.0.0 --port 4096 > /tmp/opencode-serve.log 2>&1 &' }),
  };
  writeFileSync(join(dir, 'devcontainer.json'), JSON.stringify(cfg, null, 2) + '\n');
}

export const up = (b, rebuild) => devcontainer(['up', '--workspace-folder', b.dir, ...(rebuild ? ['--remove-existing-container'] : [])]);
export const state = b => runSync('docker', ['inspect', '-f', '{{.State.Status}}', b.container]) || 'missing';

// o: { src, name, tools, git: 'token'|'forward'|'none', token, opencodeVersion }. step(label, fn) shows progress.
export async function createContainer(o, step = (_, f) => f()) {
  const { name } = o, src = isGitUrl(o.src) ? o.src : resolve(o.src);
  const b = {
    name, dir: join(ROOT, name), container: name,
    volumes: { src: `${name}-src`, home: `${name}-home` },
    port: await freePort(), password: randomBytes(16).toString('hex'),
    source: src, git: o.git, tools: o.tools, opencodeVersion: o.opencodeVersion, created: new Date().toISOString(),
  };
  saveContainer(b);
  writeDevcontainer(b);
  await run('docker', ['volume', 'create', b.volumes.src]);
  await step('Copying the source into the container', () => seed(b.volumes.src, { ...o, src }));
  await step('Building and starting the container (the first build takes a few minutes)', () => up(b));
  await step('Setting up git', async () => {
    await copyIdentity(b.container);
    if (o.git === 'token') await setupToken(b.container, ws(b), parseRemote(o.remote ?? src), o.token);
  });
  return b;
}

export async function removeContainer(b) {
  await run('docker', ['rm', '-f', b.container]).catch(() => {});
  for (const v of Object.values(b.volumes)) await run('docker', ['volume', 'rm', v]).catch(() => {});
  rmSync(b.dir, { recursive: true, force: true });
  rmSync(join(ROOT, b.name), { recursive: true, force: true });
}

// Opens a VS Code-based IDE attached to the running container
export function openIde(b, ide) {
  const hex = Buffer.from(JSON.stringify({ containerName: `/${b.container}` })).toString('hex');
  launch(ide, ['--folder-uri', `vscode-remote://attached-container+${hex}${ws(b)}`]);
}

// Import a container made by the old bash kit (~/devboxes/<name>, devbox-<name> container and volumes)
export function adoptContainer(name) {
  const dir = join(homedir(), 'devboxes', name), cfg = join(dir, '.devcontainer', 'devcontainer.json');
  if (!existsSync(cfg)) throw new Error(`No legacy container at ${dir}`);
  const text = readFileSync(cfg, 'utf8'), docker = readFileSync(join(dir, '.devcontainer', 'Dockerfile'), 'utf8');
  const b = {
    name, dir, container: `devbox-${name}`, volumes: { src: `devbox-${name}-src`, home: `devbox-${name}-home` },
    port: +text.match(/127\.0\.0\.1:(\d+)/)[1], password: text.match(/"OPENCODE_SERVER_PASSWORD": "([^"]+)"/)[1],
    source: 'legacy devbox', git: 'forward', tools: ['opencode'], opencodeVersion: docker.match(/OPENCODE_VERSION=(\S+)/)?.[1],
    created: new Date().toISOString(), legacy: true,
  };
  saveContainer(b);
  return b;
}

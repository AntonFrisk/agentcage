// Interactive dialogs (@clack/prompts) on top of the container functions. Flags pre-fill answers; --yes takes defaults.
import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, DEV_TOOLS, PROVIDERS, hostInfo } from './catalog.js';
import { cleanName, createContainer, nameTaken, openIde, ws } from './container.js';
import { isGitUrl, localRemote, parseRemote } from './git.js';
import { connectDesktop, desktopRunning, detectDesktop, latestVersion, loginProvider } from './opencode.js';
import { ok, runSync } from './run.js';

export const ask = async q => {
  const v = await q;
  if (p.isCancel(v)) { p.cancel('Cancelled.'); process.exit(0); }
  return v;
};
const step = async (label, fn) => {
  const s = p.spinner();
  s.start(label);
  try { const r = await fn(); s.stop(label); return r; } catch (e) { s.error(label); throw e; }
};

export const connectionInfo = b =>
  `Server    http://127.0.0.1:${b.port}\nUsername  opencode\nPassword  ${b.password}\nDirectory ${ws(b)}`;

const FORWARD_WARNING = `While Cursor or VS Code is attached to the container, your laptop's git credentials
and SSH agent are forwarded into the container. Any agent running in the container at
that time can use them to push to EVERY repository you have access to, not only
this one. When no IDE is attached, the container cannot push at all.`;

// IDEs that can attach to a container, found on PATH or in their usual install folder
function findIdes() {
  const found = cmd => !!runSync(process.platform === 'win32' ? 'where' : 'which', [cmd]);
  const ag = process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd') : 'antigravity-ide';
  return [['cursor', 'Cursor'], ['code', 'VS Code'], [ag, 'Antigravity']].filter(([c]) => existsSync(c) || found(c))
    .map(([value, label]) => ({ value, label }));
}

async function waitForDocker() {
  while (!ok('docker', ['info'])) {
    p.log.warn('Docker is not running (or not installed). Start Docker Desktop / the Docker service.');
    if (!(await ask(p.confirm({ message: 'Docker started. Check again?', active: 'Check again', inactive: 'Quit' })))) process.exit(1);
  }
}

// Registers the container in OpenCode Desktop, asking the user to close the app if needed
export async function registerFlow(b, interactive = true) {
  if (!detectDesktop().hasDb) return p.note(connectionInfo(b), 'OpenCode Desktop not found. Add this server by hand');
  while (desktopRunning()) {
    if (!interactive) return p.log.warn(`OpenCode Desktop is open. Close it, then run: agentcage connect ${b.name}`);
    const go = await ask(p.confirm({ message: 'Close OpenCode Desktop so the container can be added to it.', active: 'It is closed now', inactive: 'Skip for now' }));
    if (!go) return p.log.info(`Later: agentcage connect ${b.name}`);
  }
  await connectDesktop(b);
  p.log.success(`OpenCode Desktop: added server "agentcage: ${b.name}" with project ${ws(b)}`);
}

// Hands the terminal to OpenCode's own key prompt for each provider
export async function providerFlow(b, ids) {
  ids ??= await ask(p.multiselect({ message: 'Which providers should OpenCode use in this container?', options: PROVIDERS.map(x => ({ value: x.id, label: x.label, hint: x.hint })) }));
  for (const id of ids) {
    const pr = PROVIDERS.find(x => x.id === id);
    p.log.step(`${pr.label}: paste your API key when OpenCode asks for it (get one at ${pr.hint}).`);
    await loginProvider(b, id).catch(e => p.log.error(`${pr.label} was not added: ${e.message}`));
  }
}

export async function newWizard(f = {}) {
  const pick = (flag, def, prompt) => (flag !== undefined ? flag : f.yes ? def : prompt());
  p.intro('agentcage · new container');
  await waitForDocker();

  const src = f.src ?? await ask((await ask(p.select({ message: 'Where is the project?', options: [
    { value: 'folder', label: 'A folder on this computer', hint: 'copied once, incl. untracked files like .env.local' },
    { value: 'git', label: 'A git repository', hint: 'cloned from a URL' },
  ] }))) === 'folder'
    ? p.path({ message: 'Project folder', directory: true, validate: v => (v && existsSync(v) ? undefined : 'Folder not found') })
    : p.text({ message: 'Repository URL', placeholder: 'https://github.com/owner/repo.git', validate: v => (isGitUrl(v ?? '') ? undefined : 'Enter an https:// or git@ URL') }));
  if (!isGitUrl(src) && !existsSync(src)) throw new Error(`Folder not found: ${src}`);

  const nameOk = v => (!/^[a-z0-9][a-z0-9-]*$/.test(v ?? '') ? 'Use lowercase letters, digits and -' : nameTaken(v) ? `A container named '${v}' already exists` : undefined);
  const name = await pick(f.name, cleanName(src), () => ask(p.text({ message: 'Container name', initialValue: cleanName(src), validate: nameOk })));
  if (nameOk(name)) throw new Error(nameOk(name));

  // Git push access
  const remoteUrl = isGitUrl(src) ? src : localRemote(src), remote = parseRemote(remoteUrl);
  let git = 'none', token;
  if (remote) {
    git = await pick(f.git, 'forward', () => ask(p.select({ message: `How should the container push to ${remote.host}/${remote.path}?`, options: [
      { value: 'token', label: 'A token for this repo only', hint: 'recommended: agents can only push here' },
      { value: 'forward', label: "Skip: use my IDE's forwarded credentials", hint: 'access to all your repos while the IDE is attached' },
    ] })));
    if (git === 'token') {
      p.note(hostInfo(remote.host).help(remote.path), 'Repo token');
      token = process.env.AGENTCAGE_GIT_TOKEN ?? await ask(p.password({ message: 'Paste the token', validate: v => (v ? undefined : 'Required') }));
    } else if (!f.yes) {
      p.note(FORWARD_WARNING, 'Warning: cross-repo access');
      if (!(await ask(p.confirm({ message: 'Continue with forwarded credentials?', initialValue: false })))) return newWizard({ ...f, src, name });
    }
  }

  const tools = await pick(f.tools, ['opencode'], async () => [
    ...await ask(p.multiselect({ message: 'AI agents to install', options: AGENTS.map(t => ({ value: t.id, label: t.label, hint: t.hint })), initialValues: ['opencode'], required: false })),
    ...await ask(p.multiselect({ message: 'Extra dev tools (Node 24 and uv are always included)', options: DEV_TOOLS.map(t => ({ value: t.id, label: t.label, hint: t.hint })), required: false })),
  ]);
  const oc = tools.includes('opencode');

  let opencodeVersion, providers = [];
  if (oc) {
    const d = detectDesktop();
    opencodeVersion = d.version ?? await pick(undefined, await latestVersion(), async () => ask(p.text({ message: 'OpenCode Desktop not found. OpenCode version for the container', initialValue: await latestVersion() })));
    if (d.version) p.log.info(`OpenCode ${d.version} (matches your Desktop app)`);
    providers = await pick(f.providers, [], () => ask(p.multiselect({ message: 'Additional OpenCode model providers to connect (you paste each API key after the build)', options: PROVIDERS.map(x => ({ value: x.id, label: x.label, hint: x.hint })), required: false })));
  }

  const ides = findIdes();
  const ide = await pick(f.ide, 'none', () => ides.length ? ask(p.select({ message: 'Open the container in an IDE when done?', options: [...ides, { value: 'none', label: 'No' }] })) : 'none');

  p.note([
    `Source     ${src}`, `Name       ${name}`,
    `Git push   ${{ token: 'repo token', forward: 'forwarded IDE credentials', none: 'no remote' }[git]}`,
    `Tools      ${tools.join(', ') || 'none'}${oc ? ` (OpenCode ${opencodeVersion})` : ''}`,
    ...(providers.length ? [`Providers  ${providers.join(', ')}`] : []),
  ].join('\n'), 'Summary');
  if (!f.yes && !(await ask(p.confirm({ message: 'Create the container?' })))) return p.cancel('Nothing created.');

  let b;
  try {
    b = await createContainer({ src, name, tools, git, token, remote: remoteUrl, opencodeVersion }, step);
  } catch (e) {
    p.log.error(e.message);
    p.outro(`Container creation failed. Fix the problem, then clean up with: agentcage remove ${name}`);
    process.exit(1);
  }
  if (providers.length) await providerFlow(b, providers);
  if (oc) await registerFlow(b, !f.yes);
  if (ide !== 'none') { openIde(b, ide); p.log.success('Opening the IDE attached to the container'); }
  p.outro([
    `Container '${name}' is ready.`,
    oc && `OpenCode Desktop: select "agentcage: ${name}" and start a session. Only sessions on that server are isolated.`,
    tools.includes('claude-code') && `Claude Code: agentcage shell ${name}, then run claude to log in.`,
    `Shell: agentcage shell ${name}    IDE: agentcage open ${name}`,
  ].filter(Boolean).join('\n'));
}

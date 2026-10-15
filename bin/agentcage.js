#!/usr/bin/env node
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import { adoptBox, listBoxes, loadBox, removeBox, saveBox, state, up, writeDevcontainer, openIde, ws } from '../src/box.js';
import { ask, connectionInfo, newWizard, providerFlow, registerFlow } from '../src/wizard.js';
import { detectDesktop, latestVersion } from '../src/opencode.js';
import { ok, run } from '../src/run.js';

process.removeAllListeners('warning'); // hide node:sqlite ExperimentalWarning

const HELP = `agentcage: isolated dev containers for AI coding agents

  agentcage                         interactive menu (create or manage boxes)
  agentcage new [folder|git-url]    create a box  [--name x] [--tools opencode,claude-code,python,gh,pnpm]
                                      [--git token|forward] [--providers anthropic,...] [--ide cursor|code|none] [--yes]
  agentcage list                    boxes, state, port, OpenCode version
  agentcage start <name>            start a box and print OpenCode connection details
  agentcage stop <name>
  agentcage shell <name>            shell in the box (run opencode, claude, git ... here)
  agentcage open <name> [ide]       open Cursor (default), VS Code or another VS Code-based IDE attached to the box
  agentcage connect <name>          (re)register the box in OpenCode Desktop (app must be closed)
  agentcage provider <name>         add model provider API keys to OpenCode in the box
  agentcage upgrade <name>          rebuild with the Desktop app's OpenCode version (volumes kept)
  agentcage remove <name>           delete container, volumes and config
  agentcage doctor                  check Docker, Node and OpenCode Desktop
  agentcage adopt <name>            import a box made by the old devbox bash scripts

  In token mode, a token can also be passed in the AGENTCAGE_GIT_TOKEN environment variable.`;

let { values: f, positionals: [cmd, arg, arg2] } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, tools: { type: 'string' }, git: { type: 'string' }, providers: { type: 'string' },
    ide: { type: 'string' }, yes: { type: 'boolean', short: 'y' }, help: { type: 'boolean', short: 'h' } },
});
const csv = s => s?.split(',').map(x => x.trim()).filter(Boolean);
const box = () => loadBox(arg ?? (() => { throw new Error(`Usage: agentcage ${cmd} <name>`); })());

function versionWarning(b) {
  const v = detectDesktop().version;
  if (b.tools.includes('opencode') && v && b.opencodeVersion !== v)
    p.log.warn(`OpenCode Desktop is ${v}, box '${b.name}' has ${b.opencodeVersion}. If Desktop can't connect: agentcage upgrade ${b.name}`);
}
async function start(b) {
  // devcontainer up (not docker start) so postStartCommand starts the OpenCode server
  if (state(b) !== 'running') { const s = p.spinner(); s.start(`Starting '${b.name}'`); await up(b); s.stop(`Started '${b.name}'`); }
  versionWarning(b);
}

const commands = {
  async new() { await newWizard({ src: arg, name: f.name, tools: csv(f.tools), git: f.git, providers: csv(f.providers), ide: f.ide, yes: f.yes }); },
  list() {
    const rows = listBoxes().map(b => [b.name, state(b), b.tools.includes('opencode') ? String(b.port) : '-', b.opencodeVersion ?? '-', b.git]);
    if (!rows.length) return console.log('No boxes yet. Create one with: agentcage new');
    const all = [['NAME', 'STATE', 'PORT', 'OPENCODE', 'GIT'], ...rows], w = all[0].map((_, i) => Math.max(...all.map(r => r[i].length)));
    console.log(all.map(r => r.map((c, i) => c.padEnd(w[i])).join('  ')).join('\n'));
    const v = detectDesktop().version;
    if (v) console.log(`\nOpenCode Desktop: ${v}`);
  },
  async start() { const b = box(); await start(b); console.log(`Box '${b.name}' is running.\n${b.tools.includes('opencode') ? connectionInfo(b) : ''}`); },
  async stop() { await run('docker', ['stop', box().container]); },
  async shell() { const b = box(); await start(b); await run('docker', ['exec', '-it', '-u', 'node', '-w', ws(b), b.container, 'bash', '-l'], { tty: true }).catch(() => {}); },
  async open() {
    const b = box(); await start(b); openIde(b, arg2 ?? f.ide ?? 'cursor');
    if (b.git === 'token') p.log.warn('The IDE forwards your SSH agent into the box. Turn it off in the IDE settings to keep pushes limited to the repo token (see README).');
  },
  async connect() { await registerFlow(box()); },
  async provider() { const b = box(); await start(b); await providerFlow(b, csv(f.providers)); },
  async upgrade() {
    const b = box(), v = detectDesktop().version ?? await latestVersion();
    const s = p.spinner(); s.start(`Rebuilding '${b.name}' with OpenCode ${v} (volumes are kept)`);
    b.opencodeVersion = v; writeDevcontainer(b);
    await up(b, true).then(() => s.stop(`Rebuilt with OpenCode ${v}`), e => { s.error('Rebuild failed'); throw e; });
    saveBox(b);
  },
  async remove() {
    const b = box();
    if (!f.yes && !(await ask(p.confirm({ message: `Delete box '${b.name}' with its volumes? Unpushed work in the box is lost.`, initialValue: false })))) return;
    await removeBox(b); console.log(`Removed '${b.name}'.`);
  },
  doctor() {
    const d = detectDesktop(), [maj, min] = process.versions.node.split('.').map(Number);
    const checks = [
      [maj > 22 || (maj === 22 && min >= 13), `Node ${process.versions.node}`, 'Install Node 22.13 or newer'],
      [ok('docker', ['info']), 'Docker is running', 'Install/start Docker Desktop (Windows, macOS) or Docker Engine (Linux)'],
      [ok('git', ['--version']), 'git installed', 'Install git'],
      [d.hasDb, `OpenCode Desktop data: ${d.dataDir}`, 'Install OpenCode Desktop and open it once (or add servers by hand)'],
      [!!d.version, `OpenCode Desktop version: ${d.version ?? 'unknown'}${d.from ? ` (from ${d.from})` : ''}`, 'Version not found: boxes use the newest OpenCode'],
    ];
    for (const [good, msg, fix] of checks) good ? p.log.success(msg) : p.log.warn(`${msg}\n${fix}`);
    for (const b of listBoxes()) if (b.tools.includes('opencode') && d.version && b.opencodeVersion !== d.version) p.log.warn(`Box '${b.name}' has OpenCode ${b.opencodeVersion}: agentcage upgrade ${b.name}`);
  },
  adopt() { const b = adoptBox(arg); console.log(`Adopted '${b.name}' (${b.container}).`); },

  // No command: menu
  async menu() {
    const boxes = listBoxes();
    if (!boxes.length) return newWizard();
    p.intro('agentcage');
    const pick = await ask(p.select({ message: 'What do you want to do?', options: [{ value: '', label: 'Create a new box' }, ...boxes.map(b => ({ value: b.name, label: b.name, hint: state(b) }))] }));
    if (!pick) return newWizard();
    const action = await ask(p.select({ message: pick, options: [
      { value: 'start', label: 'Start and show connection details' }, { value: 'open', label: 'Open in IDE' },
      { value: 'shell', label: 'Shell' }, { value: 'provider', label: 'Add a model provider' },
      { value: 'connect', label: 'Register in OpenCode Desktop' }, { value: 'upgrade', label: 'Upgrade OpenCode' },
      { value: 'stop', label: 'Stop' }, { value: 'remove', label: 'Remove' },
    ] }));
    [cmd, arg] = [action, pick];
    await commands[action]();
  },
};

if (f.help || cmd === 'help') console.log(HELP);
else if (cmd && !commands[cmd]) { console.error(`Unknown command '${cmd}'.\n\n${HELP}`); process.exit(1); }
else await Promise.resolve().then(() => commands[cmd ?? 'menu']()).catch(e => { p.log.error(e.message); process.exit(1); });

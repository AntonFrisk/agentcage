// Getting the source into the box, and git push credentials inside it.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, runSync } from './run.js';
import { hostInfo } from './catalog.js';

// https://host/owner/repo(.git), git@host:owner/repo(.git), ssh://git@host/owner/repo → { host, path, https }
export function parseRemote(url) {
  const m = url?.match(/^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?|[^@\s/]+@)([^/:]+)[:/](.+?)(?:\.git)?\/?$/);
  return m && { host: m[1], path: m[2], https: `https://${m[1]}/${m[2]}.git` };
}
export const isGitUrl = s => /^(https?|ssh|git):\/\/|^[^@\s/]+@[^:]+:/.test(s);
export const localRemote = dir => runSync('git', ['-C', dir, 'remote', 'get-url', 'origin']) || null;

// Copy a host folder into the volume. The folder is mounted read-only into a throwaway container only.
const TAR = 'cd /src && tar -cf - --exclude=node_modules --exclude=.venv --exclude=.next . | tar -xf - -C /dst';
const seedFolder = (vol, dir) => run('docker', ['run', '--rm', '-v', `${vol}:/dst`, '-v', `${dir}:/src:ro`, 'alpine', 'sh', '-c', TAR]);

export async function seed(vol, { src, git, token }) {
  if (!isGitUrl(src)) await seedFolder(vol, src);
  else if (git === 'token') {
    // Clone in a throwaway container; the token travels as an env var, never in the URL or on disk
    const helper = '!f() { echo username=$GIT_USER; echo password=$GIT_TOKEN; }; f';
    await run('docker', ['run', '--rm', '-e', 'GIT_USER', '-e', 'GIT_TOKEN', '-v', `${vol}:/dst`, 'alpine/git', '-c', `credential.helper=${helper}`, 'clone', src, '/dst'],
      { env: { GIT_USER: hostInfo(parseRemote(src).host).user, GIT_TOKEN: token } });
  } else {
    // Clone on the host with the user's own git credentials (private repos work), then copy in
    const tmp = mkdtempSync(join(tmpdir(), 'agentcage-'));
    try {
      await run('git', ['clone', src, join(tmp, 'src')], { env: { GIT_TERMINAL_PROMPT: '0' } });
      await seedFolder(vol, join(tmp, 'src'));
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  await run('docker', ['run', '--rm', '-v', `${vol}:/dst`, 'alpine', 'chown', '-R', '1000:1000', '/dst']);
}

// Host git name/email → container
export async function copyIdentity(container) {
  for (const k of ['user.name', 'user.email']) {
    const v = runSync('git', ['config', '--global', k]);
    if (v) await run('docker', ['exec', '-u', 'node', container, 'git', 'config', '--global', k, v]);
  }
}

// Repo-scoped token: stored with git's credential store in the box's home volume, used for this repo only.
// The empty credential.helper entry clears helpers set earlier (such as the one an attached IDE forwards).
const TOKEN_SETUP = `IFS= read -r T; umask 077
printf 'https://%s:%s@%s/%s.git\\n' "$1" "$T" "$2" "$3" > ~/.git-credentials
git remote set-url origin "https://$2/$3.git"
git config --local --unset-all credential.helper
git config --local --add credential.helper '' && git config --local --add credential.helper store && git config --local credential.useHttpPath true`;

export const setupToken = (container, dir, remote, token) =>
  run('docker', ['exec', '-i', '-u', 'node', '-w', dir, container, 'sh', '-c', TOKEN_SETUP, '_', hostInfo(remote.host).user, remote.host, remote.path], { input: token + '\n' });

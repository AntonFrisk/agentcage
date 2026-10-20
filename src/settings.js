// User settings (~/.agentcage/settings.json). Missing keys fall back to the defaults.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILE = join(homedir(), '.agentcage', 'settings.json');
// Project icon colors OpenCode Desktop can show (others render as gray). green first: our default, gray: OpenCode's.
export const COLORS = ['green', 'gray', 'pink', 'blue', 'red', 'purple', 'yellow', 'orange', 'cyan'];
export const DEFAULTS = { color: 'green', containerPrefix: 'ac-', serverPrefix: 'ac-', projectPrefix: 'ac-', gitToken: 'never' };
export const LABELS = {
  color: 'OpenCode project color', containerPrefix: 'Docker container prefix',
  serverPrefix: 'OpenCode server prefix', projectPrefix: 'OpenCode project prefix',
  gitToken: 'Git token per project (GitHub, GitLab, Bitbucket)',
};
// Settings with fixed choices ({ value: label }); the others are free-text prefixes
export const CHOICES = {
  color: Object.fromEntries(COLORS.map(c => [c, c === 'gray' ? "gray (OpenCode's default)" : c])),
  gitToken: { never: "don't use (push with the IDE's forwarded credentials)", ask: 'ask every time', always: 'always use' },
};

export const loadSettings = () => ({ ...DEFAULTS, ...(existsSync(FILE) && JSON.parse(readFileSync(FILE, 'utf8'))) });
export function saveSettings(s) {
  mkdirSync(join(FILE, '..'), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n');
}

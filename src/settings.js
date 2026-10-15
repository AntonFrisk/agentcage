// User settings (~/.agentcage/settings.json). Missing keys fall back to the defaults.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILE = join(homedir(), '.agentcage', 'settings.json');
// Project icon colors OpenCode Desktop can show (others render as gray). green first: our default, gray: OpenCode's.
export const COLORS = ['green', 'gray', 'pink', 'blue', 'red', 'purple', 'yellow', 'orange', 'cyan'];
export const DEFAULTS = { color: 'green', containerPrefix: 'ac-', serverPrefix: 'ac-', projectPrefix: 'ac-' };
export const LABELS = {
  color: 'OpenCode project color', containerPrefix: 'Docker container prefix',
  serverPrefix: 'OpenCode server prefix', projectPrefix: 'OpenCode project prefix',
};

export const loadSettings = () => ({ ...DEFAULTS, ...(existsSync(FILE) && JSON.parse(readFileSync(FILE, 'utf8'))) });
export function saveSettings(s) {
  mkdirSync(join(FILE, '..'), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n');
}

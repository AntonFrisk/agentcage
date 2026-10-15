// Tools offered in the setup dialog. feature = Dev Container Feature id, npm = global npm package installed in the image.
export const AGENTS = [
  { id: 'opencode', label: 'OpenCode', hint: 'agent server for OpenCode Desktop (recommended)' },
  { id: 'claude-code', label: 'Claude Code', hint: 'run `claude` in `agentcage shell <name>`', feature: 'ghcr.io/anthropics/devcontainer-features/claude-code:1' },
];
export const DEV_TOOLS = [
  { id: 'python', label: 'Python', hint: 'system Python (uv is always included)', feature: 'ghcr.io/devcontainers/features/python:1' },
  { id: 'gh', label: 'GitHub CLI', hint: 'gh', feature: 'ghcr.io/devcontainers/features/github-cli:1' },
  { id: 'pnpm', label: 'pnpm', hint: 'Node package manager', npm: 'pnpm' },
];
export const TOOLS = [...AGENTS, ...DEV_TOOLS];

// OpenCode providers that log in with an API key (`opencode auth login <id> --method key`)
export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', hint: 'console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', hint: 'platform.openai.com/api-keys' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'openrouter.ai/settings/keys' },
  { id: 'google', label: 'Google Gemini', hint: 'aistudio.google.com/apikey' },
  { id: 'groq', label: 'Groq', hint: 'console.groq.com/keys' },
];

// How to make a token limited to one repo, per git host. user = username to send with the token over HTTPS.
const HOSTS = {
  'github.com': { user: 'x-access-token', help: p => `Create a fine-grained token: https://github.com/settings/personal-access-tokens/new\n  Repository access: Only select repositories → ${p}\n  Permissions: Contents → Read and write (add Pull requests if agents should open PRs)` },
  'gitlab.com': { user: 'oauth2', help: p => `Create a project access token: https://gitlab.com/${p}/-/settings/access_tokens\n  Role: Developer. Scopes: read_repository, write_repository` },
  'bitbucket.org': { user: 'x-token-auth', help: p => `Create a repository access token: https://bitbucket.org/${p}/admin/access-tokens\n  Permissions: Repositories → Write` },
};
export const hostInfo = host => HOSTS[host] ?? { user: 'git', help: p => `Create an access token on ${host} with read/write access to ${p} only.` };

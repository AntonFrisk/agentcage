# agentcage

```
 ▄▄▄ ▄▄▄▄ ▄▄▄▄ ▄▄▄▄  █   ▄ ▄   ▄ ▄ ▄ ▄   ▄ ▄
▄▄▄█ █  █ █▄▄▄ █  █ ▀█▀  ▄     ▄ ▄ ▄  ▀ ▀▄ ▄
█▄▄█ ▀▀▀█ █▄▄▄ █  █  █▄▄ ▄ ▄  ▀▄ ▄  ▀ ▀ ▀▄ ▄
     ▀▀▀▀                           ▀ ▀
```

Isolated dev containers for AI coding agents. Each project gets its own Linux container. **The project source lives
in a Docker volume, not in a folder mounted from your laptop**, so agents in the container can't see your other files. Each container can
run an **OpenCode server** that the OpenCode Desktop app on your laptop connects to. The app is only the UI: every agent tool
call (bash, read, edit) runs in the container. Claude Code can be installed in the container too.

Works on Windows, macOS and Linux, in any terminal (PowerShell, Terminal, bash).

## Install

You need **Docker** (Docker Desktop on Windows/macOS, Docker Engine on Linux), **Node 22.13+**, **git**, and
**OpenCode Desktop** (open it once so its settings exist).

```bash
npm install -g agentcage
agentcage doctor        # checks everything above
```

## Create a container

Run `agentcage` and follow the dialog. It asks for:

1. **Where the project is:** a folder on this computer (copied once, including untracked files such as `.env.local`)
   or a git URL (cloned).
2. **A name** for the container.
3. **Git push access** (if the project has a remote). See [Git push access](#git-push-access).
4. **AI agents:** OpenCode (on by default) and/or Claude Code.
5. **Extra dev tools:** Python, GitHub CLI, pnpm. Node 24 and uv are always included.
6. **Model providers for OpenCode** (Anthropic, OpenAI, OpenRouter, Google, Groq). After the build, OpenCode asks for each
   API key in your terminal.
7. **An IDE** to open the container in when it's ready (Cursor, VS Code, Antigravity).

Then it builds the container, adds it to OpenCode Desktop as server **agentcage: &lt;name&gt;** with the project
`/workspaces/<name>` already open, and opens the IDE.

The same works without the dialog:

```bash
agentcage new ~/code/my-project --tools opencode,claude-code --git forward --ide cursor --yes
AGENTCAGE_GIT_TOKEN=github_pat_... agentcage new https://github.com/me/repo.git --git token --yes
```

## Commands

```bash
agentcage                       # menu: create a container, or start/open/shell/upgrade/remove an existing one
agentcage list                  # containers, state, port, OpenCode version
agentcage start <name>          # start after a reboot, print the OpenCode server URL and password
agentcage shell <name>          # shell in the container (opencode, claude, git ... work here)
agentcage open <name> [ide]     # Cursor (default), VS Code, or another VS Code-based IDE attached to the container
agentcage provider <name>       # add model provider API keys to OpenCode in the container
agentcage connect <name>        # (re)register the container in OpenCode Desktop
agentcage upgrade <name>        # rebuild with the Desktop app's OpenCode version (volumes kept)
agentcage stop <name>
agentcage remove <name>         # delete container, volumes and config
agentcage doctor
agentcage adopt <name>          # import a container made by the old bash scripts in legacy/
```

Container config lives in `~/.agentcage/<name>/` (`container.json` and the generated `.devcontainer/`). `node_modules`, `.venv` and
`.next` are not copied. Instead the container runs `npm ci` / `uv sync` for every lockfile it finds.

## Git push access

The copy in the container is separate from your laptop's, so changes leave the container via **git push**. The dialog offers two ways:

- **A token for this repo only (recommended).** The dialog shows how to create one: a fine-grained GitHub token limited to
  the repo with *Contents: read and write*, a GitLab project access token, or a Bitbucket repository access token. The token
  is stored with git's credential store in the container's home volume and used for this repo only. The repo's git config clears
  any other credential helper, including the one an attached IDE forwards.
  Cursor and VS Code still forward your **SSH agent**. To close that path too, set
  `"dev.containers.copyGitConfig": false` and `"dev.containers.gitCredentialHelperConfigLocation": "none"` in the IDE's
  settings and turn off SSH agent forwarding.
- **Skip: use your IDE's forwarded credentials.** While Cursor or VS Code is attached, your laptop's git credentials and
  SSH agent are forwarded into the container, so pushing from the IDE just works. **While the IDE is attached, any agent in the
  container can use them to push to every repository you have access to.** When no IDE is attached, the container can't push at all.

For a git URL, token mode clones inside a throwaway container with the token. Forward mode clones on your laptop with your
own git credentials, then copies the repo in. Both work with private repos. Your git name and email are copied into the container.

## OpenCode Desktop

agentcage reads the Desktop app's version (from `opencode-cli.version` in its install folder) and installs the same OpenCode
version in the container, because Desktop only talks to matching servers. `list`, `start` and `doctor` warn when the app has
updated since; `agentcage upgrade <name>` rebuilds the container with the new version and keeps your code, logins and sessions.

Desktop has no API or deep link for adding a server, so agentcage writes the app's own state DB (`drafts.sqlite` in the
app's data folder, backed up as `drafts.sqlite.agentcage-backup`). **The app must be closed for this.** The dialog asks you
to close it. This relies on the app's internal storage format (written against Desktop 2.0.23), so a future app update may
break it. `agentcage start <name>` always prints the URL, username and password for adding the server by hand.

Provider API keys are typed into OpenCode's own prompt inside the container. They are stored only in the container's home volume,
never on your laptop, and survive rebuilds.

⚠️ Only sessions on the **agentcage server** are isolated. Sessions on the app's built-in **Local** server run on your laptop.

## What is and isn't isolated

- ✅ No host folders mounted, no Docker socket, not privileged. The OpenCode server is published only on `127.0.0.1` and
  requires a random password.
- ⚠️ The container has internet access and can reach services on your laptop via `host.docker.internal`.
- ⚠️ Secrets you copy in (for example `.env.local`) and provider keys can be read by agents. Use dev and test keys.
- ⚠️ An attached IDE forwards your SSH agent, and in forward mode your git credentials (see above).
- ⚠️ Use the IDE for editing, diffs and git. Its built-in AI agent runs outside the container's isolation, so run agents through
  OpenCode or Claude Code in the container.

## Platform notes

Tested on Windows 11 with Docker Desktop. On macOS and Linux, the OpenCode Desktop install and data folders are best
guesses (`/Applications/OpenCode.app`, `~/Library/Application Support/ai.opencode.desktop`, `~/.config/ai.opencode.desktop`).
`agentcage doctor` shows what it found. Please report the real paths if they differ.

## Future work: Docker Sandboxes as an alternative backend

The setup dialog should let the user choose the backend: **plain Docker container (default)** or **Docker Sandboxes**
(`sbx`). We tested `sbx` v0.48.0 on Windows 11 with the `alversjo-maps` repo:

**What works, and is better than plain Docker**
- Each sandbox is a microVM with its own kernel. Installed without admin rights (`winget install Docker.sbx`), created in ~10 s.
- `sbx create --clone opencode <repo>` gives the agent a private clone. Commits made in the sandbox are fetched on the host
  through a `sandbox-<name>` git remote, without touching the working tree. Only the clone is visible inside.
- Provider keys via `sbx secret set anthropic --sandbox <name>` (also openai, openrouter, google, groq, xai...). The sandbox
  only sees `proxy-managed` placeholders; a host proxy injects the real key, so keys never enter the sandbox.
- A repo-scoped GitHub token works the same way: `sbx secret set github --sandbox <name>`. By default a sandbox has no GitHub
  access.
- `-p 127.0.0.1:4200:4096` publishes the OpenCode server port. OpenCode 2.0.23 served the Desktop/web UI from the sandbox
  with the password.
- Network policies (open / balanced / locked down) with a per-sandbox network log.
- The image already has Node 22, uv, Python 3, git, gh, sudo and a Docker daemon. IDEs connect over SSH (`sbx setup ssh`,
  then Remote-SSH to `<name>.sbx`; not tested yet).

**What is missing for our use**
1. **OpenCode version:** the image ships OpenCode 1.18.32 (`opencode-ai`, first on PATH). Desktop 2.0.23 needs a matching
   server, so a kit or template must install `@opencode/cli@<desktop version>`.
2. **Server lifetime:** the sandbox's agent is the OpenCode TUI and `sbx exec` has no detached mode. `opencode serve` started
   with `nohup` dies when the exec session ends. It only stays up while a foreground `sbx exec ... opencode serve` runs on the
   host. A kit must start the server at sandbox boot (to be tested).
3. **Desktop registration** is still ours (the `drafts.sqlite` write), and the workspace path is the host path
   (`/c/Users/...`), not `/workspaces/<name>`.
4. **SSH agent forwarding is on by default:** the host's SSH keys were listed inside the sandbox. That is the cross-repo risk
   we want to avoid, so it must be turned off or warned about.
5. **Requirements:** Docker account sign-in for every user, macOS on Apple silicon only, Ubuntu 24.04+ with KVM only,
   Windows 11 with Hypervisor Platform.
6. OpenCode API keys: `opencode auth login` only accepts keys interactively, but with `sbx secret` this is not needed.

**Plan:** add a `backend: docker | sbx` choice to the dialog and `container.json`. The `sbx` backend maps our steps to
`sbx create --clone -p 127.0.0.1:<port>:4096 opencode <repo>`, `sbx secret set <provider|github> --sandbox <name>`, and
an OpenCode kit that pins the Desktop version and starts `opencode serve` at boot. The wizard, version detection and Desktop
registration stay the same.

## Legacy

`legacy/` holds the original bash scripts this tool replaces. `agentcage adopt <name>` takes over a container they created.

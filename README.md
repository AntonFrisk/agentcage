# devbox: isolated dev containers for AI agents

Each project runs in its own Linux (Debian) container. **The project source lives in a Docker volume, not a folder mounted
from your laptop**, so agents in the container can't see your other files. Each container runs an **OpenCode server**, and the
OpenCode Desktop app on your laptop connects to it. The app is only the UI: every agent tool call (bash, read, edit) runs in the container.
The scripts are plain bash and work on Windows (Git Bash), macOS and Linux.

## One-time setup (per laptop)

| | Windows | macOS | Linux |
|---|---|---|---|
| Docker | Docker Desktop (WSL2 backend) | Docker Desktop or OrbStack | Docker Engine |
| Shell | Git Bash | Terminal | Terminal |

Then: `npm install -g @devcontainers/cli` (needs Node on the host), and install OpenCode Desktop.

## Usage

```bash
./new-devbox.sh ~/code/my-project                 # copy a local folder (incl. untracked files such as .env.local)
./new-devbox.sh https://github.com/me/repo.git    # or clone from git
./start-devbox.sh my-project                      # start after a reboot + print connection details
./connect-devbox.sh my-project                    # (re)register server + project in OpenCode Desktop (app must be closed)
./shell-devbox.sh my-project                      # shell in the container (`opencode` TUI works here too)
./open-devbox.sh my-project [cursor|code|<path to antigravity-ide>]  # IDE attached to the container (default: cursor)
./remove-devbox.sh my-project                     # delete container + volumes
```

`node_modules`, `.venv` and `.next` are not copied. Instead the container runs `npm ci` / `uv sync` for every lockfile it finds.

## Connecting OpenCode Desktop

`new-devbox.sh` runs `connect-devbox.sh`, which adds a server **devbox: <name>** to OpenCode Desktop with the project
`/workspaces/<name>` already opened. The app has no API or deep link for this, and its *Add project* dialog only browses
your laptop. So the script writes the app's own state DB (`drafts.sqlite` in the app's data folder, backed up as `*.devbox-backup`).
**Close the app first.** If it was open, just re-run `./connect-devbox.sh <name>`. Then select the project under the
devbox server, start a session, and connect your model provider. Logins are saved in the container's `devbox-<name>-home` volume.

This relies on the app's internal storage format (written against Desktop 2.0.23), so a future app update may break it.
`./start-devbox.sh <name>` always prints the URL, username and password for adding the server by hand.

⚠️ Only sessions on the **devbox server** are isolated. Sessions on the app's built-in **Local** server run on your laptop, with full access to it.

The OpenCode version in the container is pinned to match the Desktop app (`OPENCODE_VERSION` in the Dockerfile). After the
app updates, bump it and rebuild (see below) if the connection breaks.

## Reviewing changes and source control

`./open-devbox.sh <name>` opens Cursor (or VS Code or Antigravity, which have the same dev-container support) attached to the
container at `/workspaces/<name>`. The Source Control panel, diffs, branches, commit and push all work on the repo inside the
container, and agent edits show up live. Use the IDE as an editor and git UI only. Its built-in AI agent is not covered by the
container's isolation, so run agents through OpenCode.

The copy in the container is separate from your laptop's, so changes leave the container via **git push**. Push credentials:
- **Easy:** while attached, Cursor/VS Code forward your host git credentials and SSH agent into the container, so push just works.
  Downside: while the IDE is attached, agents in the container can use those credentials too (all your repos).
- **Strict:** turn forwarding off (`"dev.containers.copyGitConfig": false`, `"dev.containers.gitCredentialHelperConfigLocation": "none"`
  in the IDE's settings) and log in inside the container with a fine-grained GitHub token limited to that one repo (`gh auth login`).

When a box is created from a Windows folder, `post-create.sh` converts CRLF line endings to LF so git status is clean, and
your host git name and email are copied in.

## What is and isn't isolated

- ✅ No host folders mounted, no Docker socket, not privileged. The OpenCode server is published only on `127.0.0.1` and requires the password.
- ⚠️ The container has internet access and can reach services on your laptop via `host.docker.internal`.
- ⚠️ Secrets you copy in (for example `.env.local`) can be read by agents. Use dev and test keys.
- ⚠️ An attached IDE forwards your host git credentials and SSH agent (see above).

## Customising

`new-devbox.sh` copies `template/.devcontainer/` to `~/devboxes/<name>/.devcontainer/` and fills in a free port and a random password.
Edit that copy to change one project, or edit the template to change all future boxes. The default image includes Node 24, uv
(which installs Python versions on demand) and OpenCode. Apply changes with
`devcontainer up --workspace-folder ~/devboxes/<name> --remove-existing-container` (your volumes are kept).

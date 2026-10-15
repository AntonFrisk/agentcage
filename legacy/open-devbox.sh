#!/usr/bin/env bash
# Opens a devbox in a VS Code-based IDE attached to its container:  ./open-devbox.sh <name> [cursor|code|antigravity-ide]
NAME=${1:?usage: open-devbox.sh <name> [ide-command]}; IDE=${2:-cursor}
"$(dirname "$0")/start-devbox.sh" "$NAME" >/dev/null || exit 1
HEX=$(printf '{"containerName":"/devbox-%s"}' "$NAME" | od -An -tx1 | tr -d ' \n')
MSYS_NO_PATHCONV=1 "$IDE" --folder-uri "vscode-remote://attached-container+$HEX/workspaces/$NAME"

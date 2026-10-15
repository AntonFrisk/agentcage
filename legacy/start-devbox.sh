#!/usr/bin/env bash
# Starts a devbox (no-op if running) and prints how to connect OpenCode Desktop:  ./start-devbox.sh <name>
NAME=${1:?usage: start-devbox.sh <name>}
BOX=~/devboxes/$NAME; command -v cygpath >/dev/null && BOX=$(cygpath -w "$BOX")
devcontainer up --workspace-folder "$BOX" >/dev/null 2>&1 || { echo "devcontainer up failed"; exit 1; }
CFG=~/devboxes/$NAME/.devcontainer/devcontainer.json
PORT=$(grep -o '127.0.0.1:[0-9]*' "$CFG" | cut -d: -f2)
PASSWORD=$(grep -o '"OPENCODE_SERVER_PASSWORD": "[^"]*"' "$CFG" | cut -d'"' -f4)
echo "
Devbox '$NAME' - OpenCode server (registered in Desktop by ./connect-devbox.sh $NAME):
  Server    http://127.0.0.1:$PORT
  Username  opencode
  Password  $PASSWORD
  Directory /workspaces/$NAME
Shell: ./shell-devbox.sh $NAME"

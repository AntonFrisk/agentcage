#!/usr/bin/env bash
# Opens a shell (or runs a command) inside a devbox:  ./shell-devbox.sh <name> [cmd...]
NAME=${1:?usage: shell-devbox.sh <name> [cmd...]}; shift
BOX=~/devboxes/$NAME; command -v cygpath >/dev/null && BOX=$(cygpath -w "$BOX")
devcontainer up --workspace-folder "$BOX" >/dev/null   # starts it if stopped (no-op if running)
exec devcontainer exec --workspace-folder "$BOX" "${@:-bash}"

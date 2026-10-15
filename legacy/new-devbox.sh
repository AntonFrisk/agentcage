#!/usr/bin/env bash
# Creates an isolated dev container for a project and starts it.
#   ./new-devbox.sh ~/Documents/code/alversjo-maps                       (local folder: copied once)
#   ./new-devbox.sh https://github.com/AntonFrisk/alversjo-maps.git [name] (git URL: cloned)
set -euo pipefail
export MSYS_NO_PATHCONV=1   # stop Git Bash from mangling container paths
SRC=${1:?usage: new-devbox.sh <folder|git-url> [name]}
NAME=${2:-$(basename "${SRC%.git}")}
BOX=~/devboxes/$NAME VOL=ac-$NAME-src
winpath() { command -v cygpath >/dev/null && cygpath -w "$1" || echo "$1"; }

docker volume inspect "$VOL" &>/dev/null && { echo "Volume $VOL exists. Run: ./remove-devbox.sh $NAME"; exit 1; }
PORT=4100; while grep -qs "127.0.0.1:$PORT:" ~/devboxes/*/.devcontainer/devcontainer.json; do PORT=$((PORT+1)); done
PASSWORD=$(openssl rand -hex 16)
mkdir -p "$BOX" && cp -r "$(dirname "$0")/template/.devcontainer" "$BOX/"
sed -i.bak "s/__PORT__/$PORT/; s/__PASSWORD__/$PASSWORD/" "$BOX/.devcontainer/devcontainer.json" && rm "$BOX/.devcontainer/devcontainer.json.bak"
docker volume create "$VOL" >/dev/null

# Seed the volume. The host folder is only mounted (read-only) into this throwaway container.
if [ -d "$SRC" ]; then
  docker run --rm -v "$VOL:/dst" -v "$(winpath "$(cd "$SRC" && pwd)"):/src:ro" alpine sh -c \
    'cd /src && tar -cf - --exclude=node_modules --exclude=.venv --exclude=.next . | tar -xf - -C /dst'
else
  docker run --rm -v "$VOL:/dst" alpine/git clone "$SRC" /dst
fi
docker run --rm -v "$VOL:/dst" alpine chown -R 1000:1000 /dst

"$(dirname "$0")/start-devbox.sh" "$NAME"
docker exec -u node "ac-$NAME" sh -c "git config --global user.name \"$(git config --global user.name)\"; git config --global user.email \"$(git config --global user.email)\""
"$(dirname "$0")/connect-devbox.sh" "$NAME" || true

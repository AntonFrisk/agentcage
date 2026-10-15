#!/usr/bin/env bash
# Registers a devbox as a server + project in OpenCode Desktop:  ./connect-devbox.sh <name>
# Desktop has no API for this, so we write its state DB directly (the app must be closed). A backup is kept.
set -euo pipefail
NAME=${1:?usage: connect-devbox.sh <name>}
CFG=~/devboxes/$NAME/.devcontainer/devcontainer.json
URL=http://127.0.0.1:$(grep -o '127.0.0.1:[0-9]*' "$CFG" | cut -d: -f2)
PASSWORD=$(grep -o '"OPENCODE_SERVER_PASSWORD": "[^"]*"' "$CFG" | cut -d'"' -f4)
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) DIR="$APPDATA/ai.opencode.desktop"; tasklist | grep -qi '^OpenCode.exe' && RUNNING=1 ;;
  Darwin) DIR=~/Library/"Application Support"/ai.opencode.desktop; pgrep -x OpenCode >/dev/null && RUNNING=1 ;;
  *)      DIR=${XDG_CONFIG_HOME:-~/.config}/ai.opencode.desktop; pgrep -x OpenCode >/dev/null && RUNNING=1 ;;
esac
[ -n "${RUNNING:-}" ] && { echo "Close OpenCode Desktop first, then re-run: ./connect-devbox.sh $NAME"; exit 1; }
DB="$DIR/drafts.sqlite"
[ -f "$DB" ] || { echo "OpenCode Desktop state not found at $DB (open the app once first)"; exit 1; }
cp "$DB" "$DB.devbox-backup"

MSYS2_ARG_CONV_EXCL=/workspaces node --no-warnings - "$DB" "$URL" "$PASSWORD" "$NAME" "/workspaces/$NAME" <<'JS'
const { DatabaseSync } = require('node:sqlite');
const [db, url, password, name, dir] = process.argv.slice(2);
const d = new DatabaseSync(db);
const row = d.prepare("select value from state where name='opencode.global.dat' and key='server'").get();
const s = { list: [], hidden: {}, projects: {}, lastProject: {}, recentlyClosed: {}, ...(row && JSON.parse(row.value)) };
const urlOf = x => typeof x === 'string' ? x : x.http?.url ?? x.url;
s.list = s.list.filter(x => urlOf(x) !== url).concat({ type: 'http', http: { url, password }, displayName: `ac-${name}` });
s.projects[url] = [{ worktree: dir, expanded: true }];
s.lastProject[url] = dir;
d.prepare(`insert into state(name, key, value, updated_at) values ('opencode.global.dat', 'server', ?, ?)
  on conflict(name, key) do update set value = excluded.value, updated_at = excluded.updated_at`).run(JSON.stringify(s), Date.now());
JS
echo "OpenCode Desktop: added server 'ac-$NAME' ($URL) with project /workspaces/$NAME"

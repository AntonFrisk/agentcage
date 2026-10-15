#!/usr/bin/env bash
# Runs in the workspace folder after the container is created.
set -e
git config --global --replace-all safe.directory "$PWD"
if [ -d .git ]; then
  # Repo copied from Windows: use Linux git settings, convert CRLF back to LF where the repo stores LF,
  # then clear files flagged modified that have no real content change (real changes are left untouched)
  git config core.autocrlf input && git config core.symlinks true && git config core.ignorecase false
  git ls-files --eol | awk -F'\t' '$1 ~ /^i\/lf +w\/crlf/ {print $2}' | xargs -r -d '\n' sed -i 's/\r$//'
  comm -23 <(git ls-files -m | sort) <(git diff --name-only | sort) | xargs -r -d '\n' git add --
fi
# Install dependencies for every npm / uv project found
find . -name package-lock.json -not -path '*/node_modules/*' -execdir npm ci \;
find . -name uv.lock -not -path '*/.venv/*' -execdir uv sync \;

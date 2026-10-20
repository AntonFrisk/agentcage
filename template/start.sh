#!/bin/sh
# Container main process. Keeps the OpenCode server running as the node user, from every container start
# (docker start, Docker Desktop restart, an IDE starting it), and restarts it if it exits.
if [ -n "$OPENCODE_SERVER_PASSWORD" ]; then
  cd "${AGENTCAGE_WORKSPACE:-/tmp}"
  while :; do
    # node opens the log: root may not write a node-owned file in /tmp (fs.protected_regular)
    runuser -u node -- sh -c 'exec opencode serve --hostname 0.0.0.0 --port 4096 >> /tmp/opencode-serve.log 2>&1'
    sleep 2
  done &
fi
exec sleep infinity

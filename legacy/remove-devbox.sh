#!/usr/bin/env bash
# Deletes a devbox's container and volumes (source + home). Push your work first!
NAME=${1:?usage: remove-devbox.sh <name>}
read -rp "Delete devbox '$NAME' including all unpushed work? [y/N] " ok; [ "$ok" = y ] || exit 1
ids=$(docker ps -aq --filter "label=agentcage.name=$NAME"); [ -n "$ids" ] && docker rm -f $ids
docker volume rm "ac-$NAME-src" "ac-$NAME-home"
rm -rf ~/devboxes/"$NAME"

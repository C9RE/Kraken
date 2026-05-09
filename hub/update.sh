#!/usr/bin/env bash
# update.sh - update + restart helper for the Kraken Hub.
#
# Usage:
#   ./update.sh                     # just pull + install + build (no restart)
#   ./update.sh restart [old_pid]   # detached restart: kill old_pid, then
#                                   # `bun run start` from this directory
#
# The `restart` form is what the hub spawns from /api/system POST when no
# KRAKEN_SYSTEMD_UNIT is set. It waits a moment for the HTTP response to
# flush, kills the old process, and re-execs the hub.

set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

cmd="${1:-update}"

case "$cmd" in
  update)
    cd "$REPO"
    git pull --ff-only
    cd "$HERE"
    bun install
    bun run build
    echo "build complete - restart the hub to pick up changes"
    ;;

  restart)
    old_pid="${2:-}"
    sleep 2
    if [[ -n "$old_pid" ]]; then
      kill "$old_pid" 2>/dev/null || true
      # give the kernel a beat to free the port
      sleep 1
      kill -9 "$old_pid" 2>/dev/null || true
    fi
    cd "$HERE"
    # Re-exec the hub with whatever env was passed through. Detached so this
    # shell can exit; new hub keeps running.
    nohup bun run start </dev/null >/tmp/kraken-hub.log 2>&1 &
    disown
    ;;

  *)
    echo "unknown command: $cmd" >&2
    echo "usage: $0 [update|restart [old_pid]]" >&2
    exit 1
    ;;
esac

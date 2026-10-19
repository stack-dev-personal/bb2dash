#!/bin/sh
# bb2dash egress healthcheck (Phase 25a, W-100): healthy while Squid listens on all three client ports.
# It reads the kernel's socket tables and opens no connection, so it adds nothing to the access log.
set -eu
readonly PORTS_HEX="0C38 0C39 0C3A"   # 3128 workspace, 3129 apply, 3130 ingest
readonly LISTEN_STATE=0A
for port in $PORTS_HEX; do
  if ! awk -v port=":$port" -v state="$LISTEN_STATE" \
      'substr($2, length($2) - 4) == port && $4 == state {found = 1} END {exit !found}' \
      /proc/net/tcp6 /proc/net/tcp 2>/dev/null; then
    echo "egress: nothing listens on port 0x$port" >&2
    exit 1
  fi
done

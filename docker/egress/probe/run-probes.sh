#!/usr/bin/env bash
# bb2dash Phase 25a, W-100, PROBE ONLY: runs P-1 to P-3 (brief 119 item A) and prints a table.
#
#   bash docker/egress/probe/run-probes.sh          build, probe, tear down, remove the probe images
#   KEEP=1 bash docker/egress/probe/run-probes.sh   leave the probe project running afterwards
#
# Everything runs in the compose project bb2dash-p25probe (docker/egress/compose.probe.yaml): its
# own two networks, images tagged :p25-probe, no secret, no volume, no live tag, no live network.
# Every compose command names its service. No credential is used: the CLI gets a made-up OAuth
# token, so api.anthropic.com answering 401 proves the request went out through the proxy.
set -uo pipefail
export MSYS_NO_PATHCONV=1

readonly PROJECT=bb2dash-p25probe
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then HERE="$(cygpath -m "$HERE")"; fi
readonly COMPOSE_FILE="$HERE/compose.probe.yaml"
readonly PROXY=http://egress:3128
readonly ALLOWED_API=api.anthropic.com
readonly ALLOWED_PROJECT=goultdzqcavefcgnifdy.supabase.co
readonly DENIED_NAME=example.com
readonly FAKE_OAUTH_TOKEN=p25-probe-made-up-oauth-token
readonly CLI_TIMEOUT_S=120
readonly NEWLINE=$'\n'

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
client() { dc exec -T "$@"; }
clear_log() { dc exec -T egress sh -c ': > /var/log/squid/access.log'; }
read_log() { dc exec -T egress cat /var/log/squid/access.log; }
last3() { local s="$1"; echo "${s: -3}"; }

ROWS=()
row() { ROWS+=("$(printf '%-5s | %-4s | %-58s | %s' "$1" "$2" "$3" "$4")"); }
verdict() { if "$@"; then echo PASS; else echo FAIL; fi; }

echo "== build and start (project $PROJECT)"
dc build egress probe-client >/dev/null || { echo "build failed"; exit 1; }
dc up -d egress probe-client >/dev/null 2>&1 || { echo "start failed"; exit 1; }
sleep 3
SQUID_VERSION="$(dc exec -T egress squid -v | head -1)"
NODE_VERSION="$(client probe-client node --version)"
CLI_VERSION="$(client probe-client claude --version)"

# --- P-0: the client has no way out but the proxy ------------------------------------------------
out="$(client probe-client curl -sS -m 8 -o /dev/null -w '%{http_code}' "https://$DENIED_NAME/" 2>&1)"
row P-0 "$(verdict test "$(last3 "$out")" = 000)" "direct HTTPS without the proxy fails (internal network)" "${out//$NEWLINE/ }"

# --- P-1: the pinned CLI sends its HTTPS through HTTPS_PROXY --------------------------------------
clear_log
cli_out="$(client -e HTTPS_PROXY=$PROXY -e CLAUDE_CODE_OAUTH_TOKEN=$FAKE_OAUTH_TOKEN probe-client \
  sh -c "mkdir -p \$CLAUDE_CONFIG_DIR && cd /tmp && timeout $CLI_TIMEOUT_S claude -p ping --no-session-persistence --tools \"\" --output-format json" 2>&1)"
log="$(read_log)"
status="$(grep -oE '"api_error_status":[0-9]+' <<<"$cli_out")"
spliced="$(grep -cE "TCP_TUNNEL/200 CONNECT $ALLOWED_API:443 sni=$ALLOWED_API bump=splice" <<<"$log")"
CLI_HOSTS="$(grep -oE 'CONNECT [^ ]+' <<<"$log" | sort -u | sed 's/CONNECT //' | tr '\n' ' ')"
CLI_DENIED="$(grep -E 'TCP_DENIED|bump=terminate' <<<"$log" | grep -oE 'CONNECT [^ ]+' | sort -u | tr '\n' ' ')"
row P-1 "$(verdict test "$status" = '"api_error_status":401' -a "$spliced" -ge 1)" \
  "CLI $CLI_VERSION through the proxy, made-up token" "$status; $spliced spliced tunnels to $ALLOWED_API; denied: ${CLI_DENIED:-none}"

# --- P-2: Node 22's fetch through the proxy -------------------------------------------------------
fetch_row() {
  local id="$1" label="$2" expect="$3"; shift 3
  clear_log
  local out; out="$(client "$@" 2>/dev/null)"
  local log; log="$(read_log)"
  local n; n="$(grep -cE "TCP_TUNNEL/200 CONNECT $ALLOWED_PROJECT:443 sni=$ALLOWED_PROJECT bump=splice" <<<"$log")"
  local reached; reached="$(grep -oE '"reached":(true|false)' <<<"$out")"
  local st; st="$(grep -oE '"(status|error)":[^,]+' <<<"$out")"
  if [ "$expect" = reached ]; then
    row "$id" "$(verdict test "$reached" = '"reached":true' -a "$n" -ge 1)" "$label" "$reached $st; $n spliced"
  else
    row "$id" "$(verdict test "$reached" = '"reached":false')" "$label" "$reached $st (no proxy without the flag)"
  fi
}
fetch_row P-2x "fetch, HTTPS_PROXY only (no NODE_USE_ENV_PROXY)" unreached \
  -e HTTPS_PROXY=$PROXY probe-client node /probe/fetch-probe.mjs native
fetch_row P-2a "fetch, HTTPS_PROXY + NODE_USE_ENV_PROXY=1" reached \
  -e HTTPS_PROXY=$PROXY -e NODE_USE_ENV_PROXY=1 probe-client node /probe/fetch-probe.mjs native
fetch_row P-2b "fetch + undici 6.28.1 EnvHttpProxyAgent (the fallback)" reached \
  -e HTTPS_PROXY=$PROXY probe-client node /probe/fetch-probe.mjs undici

# --- P-3: refused by name and by SNI ---------------------------------------------------------------
clear_log
out="$(client probe-client curl -sS -m 15 -x $PROXY -o /dev/null -w '%{http_code}' "https://$DENIED_NAME/" 2>&1)"
log="$(read_log)"
denied="$(grep -cE "TCP_DENIED/[0-9]+ CONNECT $DENIED_NAME:443 .* server=-" <<<"$log")"
tunnel="$(grep -cE "TCP_TUNNEL/200 CONNECT $DENIED_NAME" <<<"$log")"
row P-3a "$(verdict test "$(last3 "$out")" = 000 -a "$denied" -ge 1 -a "$tunnel" -eq 0)" \
  "CONNECT $DENIED_NAME refused by name" "$(grep -m1 "CONNECT $DENIED_NAME" <<<"$log" | cut -d' ' -f3-)"

sni_try() { # <connect host> <sni>: prints "established" or "refused", then the log line
  clear_log
  local o; o="$(client probe-client sh -c "echo | timeout 20 openssl s_client -proxy egress:3128 -connect $1:443 -servername $2 -brief 2>&1")"
  if grep -q 'CONNECTION ESTABLISHED' <<<"$o"; then echo -n established; else echo -n refused; fi
  echo " | $(read_log | grep "sni=$2" | tail -1 | cut -d' ' -f3-)"
}
r="$(sni_try $ALLOWED_API $DENIED_NAME)"
row P-3b "$(verdict grep -q "^refused .*bump=terminate" <<<"$r")" "CONNECT $ALLOWED_API, SNI $DENIED_NAME refused by SNI" "$r"
r="$(sni_try $ALLOWED_API $ALLOWED_API)"
row P-3b+ "$(verdict grep -q "^established .*bump=splice" <<<"$r")" "control: CONNECT $ALLOWED_API, SNI the same name" "$r"
r="$(sni_try $ALLOWED_API $ALLOWED_PROJECT)"
row P-3c "$(verdict grep -q "^refused .*bump=terminate" <<<"$r")" "CONNECT $ALLOWED_API, SNI another listed name" "$r"

for target in 10.250.26.1 localhost; do
  clear_log
  client probe-client curl -sS -m 10 -x $PROXY -o /dev/null "https://$target/" >/dev/null 2>&1
  log="$(read_log)"
  row P-3d "$(verdict grep -qE "TCP_DENIED/[0-9]+ CONNECT $target:443 .* server=-" <<<"$log")" \
    "private destination $target refused" "$(head -1 <<<"$log" | cut -d' ' -f3-)"
done
clear_log
client probe-client curl -sS -m 10 -x $PROXY -o /dev/null "http://$ALLOWED_API/" >/dev/null 2>&1
log="$(read_log)"
row P-3e "$(verdict grep -qE "TCP_DENIED" <<<"$log")" "plain HTTP (no CONNECT) refused" "$(head -1 <<<"$log" | cut -d' ' -f3-)"

# Informational: what peek-and-splice cannot see. The Host header travels inside TLS.
out="$(client probe-client curl -s -m 15 -x $PROXY -H "Host: $DENIED_NAME" -o /dev/null -w '%{http_code}' "https://$ALLOWED_API/" 2>&1)"
row info "-" "SNI $ALLOWED_API with Host: $DENIED_NAME (fronting, inside TLS)" "HTTP $(last3 "$out") from the far side"

echo
echo "Squid: $SQUID_VERSION | Node: $NODE_VERSION | CLI: $CLI_VERSION"
echo "Hosts the CLI asked the proxy for: ${CLI_HOSTS:-none}"
echo
printf '%-5s | %-4s | %-58s | %s\n' id res probe evidence
printf -- '------+------+------------------------------------------------------------+---------\n'
printf '%s\n' "${ROWS[@]}"

if [ "${KEEP:-0}" != 1 ]; then
  echo
  echo "== tear down: project, networks and the two :p25-probe images"
  dc down -v --rmi all >/dev/null 2>&1 && echo "removed"
fi

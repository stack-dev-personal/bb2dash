#!/usr/bin/env bash
# bb2dash Phase 25a, W-100: the egress proxy end to end, in a throwaway compose project.
#
#   bash docker/egress/e2e/run-e2e.sh          build, start, probe, recreate egress, probe, tear down
#   KEEP=1 bash docker/egress/e2e/run-e2e.sh   leave the project running (tear down by hand, below)
#
# What it shows, from each of workspace, apply and workspace-ingest, with the real images, the real
# firewalls and the real compose.yaml:
#   * the firewall came up (its own end check: DNS closed, example.com refused through egress and
#     directly, the allowed name answers through egress);
#   * HTTPS to its listed names goes through egress, on its own port (fetch, and the CLI with a made-up
#     token in workspace and apply: Anthropic's 401 proves the route);
#   * example.com is refused by name, and by SNI behind a listed CONNECT host;
#   * a direct tcp/443 to a public address and another client's proxy port are refused by the firewall;
#   * DNS answers nothing, while egress and the pooler resolve from their pins;
#   * (review fixes) a CONNECT to an IPv4 or IPv6 address literal is refused; a ClientHello with no
#     SNI is terminated; a CONNECT to an unlisted canary name is refused and egress makes no DNS query
#     for it: egress's only upstream resolver here is `dnslog` (CoreDNS with `log`), and its log holds
#     the listed names egress did resolve, a control name looked up from inside egress, and never the
#     canary;
#   * after egress is restarted, and after it is recreated, alone and by name, every client's route
#     works again (the recreated egress keeps its addresses on its own networks).
#
# Safety: project bb2dash-p25egress, image tags :p25-egress (compose.e2e.yaml), its own copies of the
# networks, every service named in every command, never a bare `up`. Secrets are fake files in a
# scratch folder; the clients run `sleep infinity`, so nothing logs in to the pooler or anywhere else.
# The teardown removes this project's containers, networks and volumes and the four :p25-egress
# images by name (never `--rmi all`, which would reach images compose.yaml names for other services).
set -uo pipefail
export MSYS_NO_PATHCONV=1

readonly PROJECT=bb2dash-p25egress
readonly TAG=p25-egress
readonly SERVICES=(egress workspace apply workspace-ingest)
# Started too, never built: the logging resolver (compose.e2e.yaml) and its pinned image.
readonly DNSLOG_SERVICE=dnslog
readonly DNSLOG_IMAGE=coredns/coredns:1.11.3
readonly CLIENTS=(workspace apply workspace-ingest)
readonly PROJECT_HOST=goultdzqcavefcgnifdy.supabase.co
readonly API_HOST=api.anthropic.com
readonly REFUSED_NAME=example.com
# A name no list holds and nobody would look up: if it ever reaches dnslog, egress resolved it.
readonly CANARY="p25-canary-$(date +%s)-$RANDOM.example.net"
readonly CONTROL_NAME="p25-control-$(date +%s)-$RANDOM.example.net"
# Address literals as CONNECT hosts: api.anthropic.com's IPv4 address (2026-10-19) and an IPv6 one.
readonly IPV4_LITERAL=160.79.104.10
readonly IPV6_LITERAL='[2607:6bc0::10]'
readonly REFUSED_CONNECTS="$IPV4_LITERAL,$IPV6_LITERAL,$CANARY"
# A real pooler name, so the firewall can resolve and pin it; the user and password are made up and
# nothing ever connects with them.
readonly FAKE_POOLER=aws-0-us-east-1.pooler.supabase.com
readonly FAKE_DSN="postgresql://e2e.fake:not-a-password@$FAKE_POOLER:5432/postgres"
readonly FAKE_TOKEN=e2e-made-up-oauth-token
readonly CLI_TIMEOUT_S=120
readonly START_WAIT_S=180

to_native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi; }
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
readonly COMPOSE_MAIN="$(to_native "$REPO/compose.yaml")"
readonly COMPOSE_E2E="$(to_native "$HERE/compose.e2e.yaml")"
readonly PROBE_SCRIPT="$HERE/client-probe.mjs"
FAKE_SECRETS="$(mktemp -d)"
export SECRETS_DIR="$(to_native "$FAKE_SECRETS")"
export HARNESS_DIR="${HARNESS_DIR:-$(to_native "$REPO/../agentic-harness")}"

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_MAIN" -f "$COMPOSE_E2E" --profile workspace --profile apply "$@"; }

ROWS=()
FAILS=0
row() {
  local result="$1" client="$2" check="$3" detail="$4"
  [ "$result" = PASS ] || FAILS=$((FAILS + 1))
  ROWS+=("$(printf '%-4s | %-16s | %-44s | %s' "$result" "$client" "$check" "$detail")")
}

teardown() {
  rm -rf "$FAKE_SECRETS"
  if [ "${KEEP:-0}" = 1 ]; then
    echo "KEEP=1: left running. Tear down: docker compose -p $PROJECT down -v; docker rmi bb2dash-egress:$TAG bb2dash-workspace:$TAG bb2dash-apply:$TAG bb2dash-workspace-ingest:$TAG $DNSLOG_IMAGE"
    return
  fi
  echo "== tear down: project $PROJECT (containers, networks, volumes) and the four :$TAG images"
  dc down -v --remove-orphans >/dev/null 2>&1
  docker rmi "bb2dash-egress:$TAG" "bb2dash-workspace:$TAG" "bb2dash-apply:$TAG" "bb2dash-workspace-ingest:$TAG" "$DNSLOG_IMAGE" >/dev/null 2>&1
  echo "removed"
}
trap teardown EXIT
# A signal (a timeout, Ctrl-C) ends the run through exit, so the EXIT trap still tears down.
trap 'exit 130' INT TERM

# --- fake secrets: every file compose.yaml names, none of them real --------------------------------
for name in workspace_runner_db_url inbox_apply_db_url workspace_ingest_db_url sync_runner_db_url; do
  printf '%s\n' "$FAKE_DSN" >"$FAKE_SECRETS/$name"
done
printf '%s\n' "$FAKE_TOKEN" >"$FAKE_SECRETS/claude_oauth_token"
for name in bb2dash_mcp_service_key supabase_anon_jwt supabase_publishable_key novnc_password; do
  printf 'e2e-made-up-%s\n' "$name" >"$FAKE_SECRETS/$name"
done

echo "== build (${SERVICES[*]}, tags :$TAG)"
dc build "${SERVICES[@]}" >/dev/null || { echo "build failed"; exit 1; }

started_at() { docker inspect -f '{{.State.StartedAt}}' "$(dc ps -q "$1")" 2>/dev/null; }

wait_clients() { # each client running with its firewall raised, or a failure row
  local client deadline=$((SECONDS + START_WAIT_S))
  for client in "${CLIENTS[@]}"; do
    # The log is read whole, then searched: a grep -q on a pipe would stop early, and under pipefail
    # the writer's broken pipe would read as "not found" forever.
    until grep -q 'Firewall raised:' <<<"$(dc logs --no-color --no-log-prefix "$client" 2>&1)"; do
      if [ "$SECONDS" -ge "$deadline" ]; then
        row FAIL "$client" "firewall raised" "no 'Firewall raised' line within ${START_WAIT_S}s"
        dc logs --no-color --no-log-prefix "$client" 2>&1 | tail -15
        return 1
      fi
      sleep 3
    done
  done
}

firewall_rows() {
  local client log
  for client in "${CLIENTS[@]}"; do
    log="$(dc logs --no-color --no-log-prefix "$client" 2>&1)"
    if grep -q 'Firewall raised: .* DNS closed' <<<"$log" &&
      grep -q 'DNS answers nothing' <<<"$log" &&
      grep -q 'refused https://example.com as expected' <<<"$log" &&
      grep -q 'unable to reach https://example.com directly as expected' <<<"$log"; then
      row PASS "$client" "firewall raised, its end check passed" "$(grep -o 'Firewall raised: .*' <<<"$log" | tail -1)"
    else
      row FAIL "$client" "firewall raised, its end check passed" "see: docker compose -p $PROJECT logs $client"
    fi
  done
}

probe_client() { # <client> <port> <other ports> <allowed> <refused>
  local client="$1" out line ok check target detail
  out="$(dc exec -T -u node \
    -e PROBE_PORT="$2" -e PROBE_OTHER_PORTS="$3" -e PROBE_ALLOWED="$4" -e PROBE_REFUSED="$5" -e PROBE_POOLER="$FAKE_POOLER" -e PROBE_CONNECTS="$REFUSED_CONNECTS" \
    "$client" node --input-type=module - <"$PROBE_SCRIPT" 2>/dev/null)"
  [ -n "$out" ] || { row FAIL "$client" "client probe ran" "no output"; return; }
  while read -r line; do
    ok="$(sed -n 's/.*"ok":\(true\|false\).*/\1/p' <<<"$line")"
    check="$(sed -n 's/.*"check":"\([^"]*\)".*/\1/p' <<<"$line")"
    target="$(sed -n 's/.*"target":"\([^"]*\)".*/\1/p' <<<"$line")"
    detail="$(sed -n 's/.*"detail":"\([^"]*\)".*/\1/p' <<<"$line")"
    row "$([ "$ok" = true ] && echo PASS || echo FAIL)" "$client" "$check $target" "$detail"
  done <<<"$out"
}

cli_row() { # <client>: the pinned CLI with a made-up token; a 401 from Anthropic proves the route
  local client="$1" out status
  out="$(dc exec -T -u node -e CLAUDE_CODE_OAUTH_TOKEN="$FAKE_TOKEN" "$client" \
    sh -c "cd /tmp && timeout $CLI_TIMEOUT_S claude -p ping --no-session-persistence --tools '' --output-format json" 2>&1)"
  status="$(grep -oE '"api_error_status":[0-9]+' <<<"$out" | head -1)"
  row "$([ "$status" = '"api_error_status":401' ] && echo PASS || echo FAIL)" "$client" "CLI through egress, made-up token" "${status:-no status: ${out:0:120}}"
}

log_rows() { # the proxy's own record, per port
  local log port client
  log="$(dc logs --no-color --no-log-prefix egress 2>&1)"
  for pair in 3128:workspace 3129:apply 3130:workspace-ingest; do
    port="${pair%%:*}"
    client="${pair#*:}"
    if grep -qE "port=$port TCP_TUNNEL/200 CONNECT $PROJECT_HOST:443 sni=$PROJECT_HOST bump=splice server=[0-9]" <<<"$log"; then
      row PASS "$client" "egress log: spliced to the project host" "port=$port TCP_TUNNEL ... bump=splice"
    else
      row FAIL "$client" "egress log: spliced to the project host" "no such line on port $port"
    fi
    if grep -qE "port=$port TCP_DENIED/[0-9]+ CONNECT $REFUSED_NAME:443 .* server=-" <<<"$log"; then
      row PASS "$client" "egress log: $REFUSED_NAME refused by name" "port=$port TCP_DENIED ... server=-"
    else
      row FAIL "$client" "egress log: $REFUSED_NAME refused by name" "no such line on port $port"
    fi
    if grep -qE "port=$port .* sni=$REFUSED_NAME bump=terminate server=-" <<<"$log"; then
      row PASS "$client" "egress log: $REFUSED_NAME refused by SNI" "port=$port ... sni=$REFUSED_NAME bump=terminate"
    else
      row FAIL "$client" "egress log: $REFUSED_NAME refused by SNI" "no such line on port $port"
    fi
  done
  local literal
  for pair in 3128:workspace 3129:apply 3130:workspace-ingest; do
    port="${pair%%:*}"
    client="${pair#*:}"
    for literal in "$IPV4_LITERAL" "$IPV6_LITERAL" "$CANARY"; do
      if grep -F "port=$port TCP_DENIED/200 CONNECT $literal:443 " <<<"$log" | grep -c 'server=-$' >/dev/null; then
        row PASS "$client" "egress log: CONNECT $literal refused" "port=$port TCP_DENIED ... server=-"
      else
        row FAIL "$client" "egress log: CONNECT $literal refused" "no such line on port $port"
      fi
    done
    if grep -qE "port=$port .* sni=- bump=terminate server=-" <<<"$log"; then
      row PASS "$client" "egress log: no SNI terminated" "port=$port ... sni=- bump=terminate"
    else
      row FAIL "$client" "egress log: no SNI terminated" "no such line on port $port"
    fi
  done
  if grep -qE "port=3130 TCP_DENIED/[0-9]+ CONNECT $API_HOST:443" <<<"$log"; then
    row PASS "workspace-ingest" "egress log: $API_HOST not on its list" "port=3130 TCP_DENIED CONNECT $API_HOST"
  else
    row FAIL "workspace-ingest" "egress log: $API_HOST not on its list" "no such line on port 3130"
  fi
}

dns_rows() { # what egress asked its only upstream resolver: the listed names and the control, never the canary
  local log
  dc exec -T egress getent hosts "$CONTROL_NAME" >/dev/null 2>&1 # NXDOMAIN is fine: the query is what counts
  sleep 2
  log="$(dc logs --no-color --no-log-prefix "$DNSLOG_SERVICE" 2>&1)"
  if grep -qF "\"A IN $API_HOST. " <<<"$log"; then
    row PASS dnslog "egress's lookups reach the logging resolver" "A IN $API_HOST. logged"
  else
    row FAIL dnslog "egress's lookups reach the logging resolver" "no query for $API_HOST in the dnslog log"
  fi
  if grep -qF "$CONTROL_NAME." <<<"$log"; then
    row PASS dnslog "an unlisted name looked up in egress is logged" "$CONTROL_NAME logged (control)"
  else
    row FAIL dnslog "an unlisted name looked up in egress is logged" "the control name is missing: the log proves nothing"
  fi
  if grep -qF "$CANARY" <<<"$log"; then
    row FAIL dnslog "no query for the refused canary name" "$CANARY was resolved"
  else
    row PASS dnslog "no query for the refused canary name" "$(grep -c ' IN ' <<<"$log") queries logged, none for $CANARY"
  fi
  if grep -qF "in-addr.arpa" <<<"$log" || grep -qF "ip6.arpa" <<<"$log"; then
    row FAIL dnslog "no reverse lookup of an address literal" "$(grep -oE '[^ ]+\.(in-addr|ip6)\.arpa' <<<"$log" | head -1)"
  else
    row PASS dnslog "no reverse lookup of an address literal" "no in-addr.arpa or ip6.arpa query"
  fi
}

all_probes() {
  firewall_rows
  probe_client workspace 3128 3129,3130 "$API_HOST,$PROJECT_HOST" "$REFUSED_NAME"
  probe_client apply 3129 3128,3130 "$API_HOST,$PROJECT_HOST" "$REFUSED_NAME"
  probe_client workspace-ingest 3130 3128,3129 "$PROJECT_HOST" "$REFUSED_NAME,$API_HOST"
}

echo "== start (${SERVICES[*]})"
dc up -d "$DNSLOG_SERVICE" "${SERVICES[@]}" >/dev/null 2>&1 || echo "up reported a failure; the rows below say where"
wait_clients
all_probes
cli_row workspace
cli_row apply
log_rows
dns_rows

wait_egress_healthy() {
  local deadline=$((SECONDS + START_WAIT_S))
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q egress)" 2>/dev/null)" = healthy ]; do
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 2
  done
}
egress_addresses() { docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$(dc ps -q egress)"; }
route_rows() { # <when>: each client's own fetch to the project host, through egress as it now stands
  local when="$1" client out
  for client in "${CLIENTS[@]}"; do
    out="$(dc exec -T -u node "$client" node -e \
      "fetch('https://$PROJECT_HOST/').then((r) => console.log('HTTP ' + r.status), (e) => console.log('failed ' + (e.cause?.code ?? e.message)))" 2>/dev/null)"
    row "$([[ "$out" == HTTP* ]] && echo PASS || echo FAIL)" "$client" "route to the project host $when" "${out:-no output}"
  done
}

echo "== restart egress, then recreate it, each alone, by name: the route must come back for every client"
declare -A before=()
for client in "${CLIENTS[@]}"; do before[$client]="$(started_at "$client")"; done
addresses_before="$(egress_addresses)"
dc restart egress >/dev/null 2>&1
wait_egress_healthy || row FAIL egress "healthy after restart" "not healthy within ${START_WAIT_S}s"
restarted=()
for client in "${CLIENTS[@]}"; do [ "$(started_at "$client")" != "${before[$client]}" ] && restarted+=("$client"); done
echo "   compose restart egress restarted these clients: ${restarted[*]:-none}"
route_rows "after egress restarted"
dc up -d --force-recreate egress >/dev/null 2>&1
wait_egress_healthy || row FAIL egress "healthy after recreate" "not healthy within ${START_WAIT_S}s"
addresses_after="$(egress_addresses)"
row "$([ "$addresses_before" = "$addresses_after" ] && echo PASS || echo FAIL)" egress "recreated egress kept its addresses" "[ $addresses_before] -> [ $addresses_after]"
route_rows "after egress recreated"

echo
printf '%-4s | %-16s | %-44s | %s\n' res client check detail
printf -- '-----+------------------+----------------------------------------------+---------\n'
printf '%s\n' "${ROWS[@]}"
echo
echo "${#ROWS[@]} checks, $FAILS failed"
[ "$FAILS" -eq 0 ]

#!/bin/sh
# bb2dash egress proxy entrypoint (Phase 25a, W-100). Runs as `proxy`, never root.
#
# Makes the certificate Squid's syntax demands on an ssl-bump port, in the tmpfs /run/egress, new at
# every start and readable by `proxy` alone, then runs Squid in the foreground. No rule bumps a
# tunnel; the certificate only carries Squid's denial of a refused CONNECT, and no client trusts it.
set -eu

readonly CERT_DIR=/run/egress
readonly CERT_FILE="$CERT_DIR/bump.pem"
readonly CERT_DAYS=30
readonly CERT_SUBJECT="/CN=bb2dash-egress-untrusted"

umask 077
[ -d "$CERT_DIR" ] && [ -w "$CERT_DIR" ] || { echo "egress: $CERT_DIR is not a writable folder" >&2; exit 78; }
rm -f "$CERT_FILE"
openssl req -x509 -newkey rsa:2048 -nodes -days "$CERT_DAYS" -subj "$CERT_SUBJECT" \
  -keyout "$CERT_FILE" -out "$CERT_FILE" 2>/dev/null \
  || { echo "egress: the certificate could not be made" >&2; exit 78; }

exec "$@"

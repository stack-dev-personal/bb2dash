#!/bin/sh
# bb2dash egress (Phase 25a, W-100): an external acl helper for squid.conf's sni_present.
#
# Squid sends one line per check: the SNI of the ClientHello it peeked at (%ssl::>sni, "-" when the
# client named no server), then the acl's own arguments ("-" here). OK means a name was sent; ERR means
# none, and squid.conf terminates the tunnel (ssl::server_name falls back to the CONNECT host when there
# is no SNI, so it cannot tell the two apart). It reads stdin and writes stdout only: no file, no
# network, no lookup.
while IFS=" " read -r sni _rest; do
  case "$sni" in
    "" | "-") echo ERR ;;
    *) echo OK ;;
  esac
done

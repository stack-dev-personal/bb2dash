# bb2dash Phase 25a, W-100, PROBE ONLY: the egress proxy (Squid with OpenSSL, peek-and-splice).
# Built only by compose.probe.yaml as bb2dash-egress:p25-probe; never a live tag.
#
# Squid 6.13 from Debian 13.7 (trixie), the `squid-openssl` build: Debian's plain `squid` package
# has no TLS support and cannot peek. Both the base image and the package are pinned to exact
# versions; a bump is a deliberate change.
FROM debian:13.7-slim

ARG SQUID_VERSION=6.13-2+deb13u3

RUN apt-get update \
 && apt-get install -y --no-install-recommends "squid-openssl=${SQUID_VERSION}" openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# The certificate Squid's syntax demands on an ssl-bump port. Never presented: no rule bumps.
RUN openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
      -subj "/CN=bb2dash-egress-unused-bump-cert" \
      -keyout /etc/squid/unused-bump.pem -out /etc/squid/unused-bump.pem 2>/dev/null \
 && chown root:proxy /etc/squid/unused-bump.pem && chmod 0640 /etc/squid/unused-bump.pem \
 && mkdir -p /var/log/squid /var/spool/squid \
 && chown proxy:proxy /var/log/squid /var/spool/squid

COPY squid.conf /etc/squid/squid.conf
RUN sed -i 's/\r$//' /etc/squid/squid.conf && squid -k parse -f /etc/squid/squid.conf

EXPOSE 3128
# Foreground, no daemon; Squid drops to `proxy` itself after opening the port.
CMD ["squid", "-N", "-f", "/etc/squid/squid.conf"]

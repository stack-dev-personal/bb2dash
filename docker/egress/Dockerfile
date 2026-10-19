# bb2dash egress proxy (Phase 25a, brief 119 item A, W-100): Squid with OpenSSL, peek-and-splice, no
# decryption. The service `egress` in compose.yaml; built from docker/egress/ as its own context.
#
# Squid 6.13 from Debian 13.7 (trixie), the `squid-openssl` build: Debian's plain `squid` package has no
# TLS support and cannot peek. The base image and the package are pinned to exact versions; a bump is a
# deliberate change, and docker/egress/egress.test.mjs pins both literals.
FROM debian:13.7-slim

ARG SQUID_VERSION=6.13-2+deb13u3

RUN apt-get update \
 && apt-get install -y --no-install-recommends "squid-openssl=${SQUID_VERSION}" openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY squid.conf /etc/squid/squid.conf
COPY entrypoint.sh /usr/local/bin/egress-entrypoint
COPY healthcheck.sh /usr/local/bin/egress-healthcheck
# A Windows checkout may hand over CRLF; a shebang line must end in LF. The files are root's and
# read-only to `proxy`, which Squid runs as.
RUN sed -i 's/\r$//' /etc/squid/squid.conf /usr/local/bin/egress-entrypoint /usr/local/bin/egress-healthcheck \
 && chmod 0644 /etc/squid/squid.conf \
 && chmod 0755 /usr/local/bin/egress-entrypoint /usr/local/bin/egress-healthcheck

# The config must parse. The parse wants the certificate file to exist, so a throwaway one is made
# for it in a build-only folder and removed in the same layer: the image holds no key.
RUN mkdir -p /run/egress \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=parse-only" \
      -keyout /run/egress/bump.pem -out /run/egress/bump.pem 2>/dev/null \
 && squid -k parse -f /etc/squid/squid.conf \
 && rm -rf /run/egress

# Squid runs as `proxy` from the start (compose sets the same user, a read-only root, every capability
# dropped and a tmpfs at /run/egress and /tmp), so it never holds root to give up.
USER proxy
EXPOSE 3128 3129 3130
ENTRYPOINT ["/usr/local/bin/egress-entrypoint"]
CMD ["squid", "-N", "-f", "/etc/squid/squid.conf"]

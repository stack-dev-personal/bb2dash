// bb2dash Phase 25a, W-100: the end-to-end probe one client container runs (docker/egress/e2e/run-e2e.sh).
//
// Piped into `node --input-type=module -` inside workspace, apply or workspace-ingest, as the node user,
// after the container's firewall is up. It never sends a credential. Its settings come from the
// environment run-e2e.sh passes:
//
//   PROBE_PORT          this client's proxy port (the firewall allows this one only)
//   PROBE_OTHER_PORTS   the other clients' proxy ports, comma-separated (must be refused)
//   PROBE_ALLOWED       names this client's list holds, comma-separated (must answer through egress)
//   PROBE_REFUSED       names its list does not hold, comma-separated (must be refused by egress)
//   PROBE_POOLER        the pooler host pinned from the fake DSN (tcp/5432 stays direct)
//   PROBE_CONNECTS      CONNECT hosts egress must refuse, comma-separated: address literals (IPv4,
//                       bracketed IPv6) and an unlisted canary name (Phase 25a review fixes)
//
// One JSON line per check on stdout: {check, target, ok, detail}. `ok` is what the check wanted.
import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';

const PROXY_HOST = 'egress';
const TIMEOUT_MS = 10_000;
const DENIED_SNI = 'example.com';
/** Public addresses to try directly on 443: Cloudflare's resolver and api.anthropic.com's (2026-10-19). */
const DIRECT_ADDRESSES = ['1.1.1.1', '160.79.104.10'];
const list = (name) => (process.env[name] ?? '').split(',').map((v) => v.trim()).filter(Boolean);

const port = Number(process.env.PROBE_PORT);
const otherPorts = list('PROBE_OTHER_PORTS').map(Number);
const allowed = list('PROBE_ALLOWED');
const refused = list('PROBE_REFUSED');
const pooler = process.env.PROBE_POOLER ?? '';
const refusedConnects = list('PROBE_CONNECTS');

const emit = (check, target, ok, detail) => console.log(JSON.stringify({ check, target, ok, detail: String(detail) }));
const errorCode = (error) => error?.cause?.code ?? error?.code ?? error?.cause?.message ?? error?.message ?? String(error);

/** A TCP connection: resolves 'connected' or the error code. */
function tcpTry(host, tcpPort) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: tcpPort });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(TIMEOUT_MS, () => done('timeout'));
    socket.once('connect', () => done('connected'));
    socket.once('error', (error) => done(error.code ?? error.message));
  });
}

/** CONNECT <host>:443 through this client's port, then a TLS handshake naming <sni> (null: no SNI at all): 'established' or why not. */
function tunnelTls(host, sni) {
  return new Promise((resolve) => {
    const request = http.request({ host: PROXY_HOST, port, method: 'CONNECT', path: `${host}:443`, timeout: TIMEOUT_MS });
    request.once('timeout', () => {
      request.destroy();
      resolve('timeout');
    });
    request.once('error', (error) => resolve(`connect-error:${error.code ?? error.message}`));
    request.once('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        resolve(`connect-status:${response.statusCode}`);
        return;
      }
      // With no servername and an address as host, Node sends a ClientHello with no SNI extension.
      const secure = tls.connect(sni === null ? { socket, host: '127.0.0.1', rejectUnauthorized: false, timeout: TIMEOUT_MS } : { socket, servername: sni, timeout: TIMEOUT_MS });
      secure.once('secureConnect', () => {
        const name = secure.getPeerCertificate()?.subject?.CN ?? '?';
        secure.destroy();
        resolve(`established:${name}`);
      });
      secure.once('error', (error) => resolve(`tls-error:${error.code ?? error.message}`));
      secure.once('timeout', () => {
        secure.destroy();
        resolve('tls-timeout');
      });
    });
    request.end();
  });
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    await response.text();
    return { reached: true, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { reached: false, detail: errorCode(error) };
  }
}

// 1. The environment the service gives every process.
emit('env', 'HTTPS_PROXY', process.env.HTTPS_PROXY === `http://${PROXY_HOST}:${port}`, process.env.HTTPS_PROXY ?? 'unset');
emit('env', 'NODE_USE_ENV_PROXY', process.env.NODE_USE_ENV_PROXY === '1', process.env.NODE_USE_ENV_PROXY ?? 'unset');

// 2. fetch, as mcp-server/src/client.ts and workspace-ingest/src/embed.ts call it: listed names answer.
for (const name of allowed) {
  const result = await fetchStatus(`https://${name}/`);
  emit('fetch-allowed', name, result.reached, result.detail);
}
// 3. Names not on this port's list are refused by name.
for (const name of refused) {
  const result = await fetchStatus(`https://${name}/`);
  emit('fetch-refused-by-name', name, !result.reached, result.detail);
}
// 4. A listed CONNECT host with another server name is refused by SNI; the same name is spliced.
const tunnelHost = allowed[0];
const bySni = await tunnelTls(tunnelHost, DENIED_SNI);
emit('tunnel-refused-by-sni', `${tunnelHost} sni=${DENIED_SNI}`, !bySni.startsWith('established'), bySni);
const sameName = await tunnelTls(tunnelHost, tunnelHost);
emit('tunnel-same-sni', `${tunnelHost} sni=${tunnelHost}`, sameName.startsWith('established'), sameName);
// A ClientHello with no SNI at all is terminated, even behind a listed CONNECT host.
const noSni = await tunnelTls(tunnelHost, null);
emit('tunnel-no-sni-refused', `${tunnelHost} sni=(none)`, !noSni.startsWith('established'), noSni);
// Address literals and an unlisted name are refused as CONNECT hosts, whatever the SNI says.
for (const host of refusedConnects) {
  const result = await tunnelTls(host, tunnelHost);
  emit('connect-refused', host, !result.startsWith('established'), result);
}
// 5. The firewall: no direct tcp/443 to a public address, no other client's proxy port.
for (const address of DIRECT_ADDRESSES) {
  const result = await tcpTry(address, 443);
  emit('direct-443-refused', address, result !== 'connected', result);
}
for (const other of otherPorts) {
  const result = await tcpTry(PROXY_HOST, other);
  emit('other-proxy-port-refused', `${PROXY_HOST}:${other}`, result !== 'connected', result);
}
// 6. DNS is closed; the pinned names still resolve from /etc/hosts.
try {
  const answer = await dns.resolve4(DENIED_SNI);
  emit('dns-closed', DENIED_SNI, false, `answered ${answer.length} address(es)`);
} catch (error) {
  emit('dns-closed', DENIED_SNI, true, error.code ?? error.message);
}
try {
  const { address } = await dns.lookup(PROXY_HOST, { family: 4 });
  emit('egress-pinned', PROXY_HOST, net.isIPv4(address), 'resolved from /etc/hosts');
} catch (error) {
  emit('egress-pinned', PROXY_HOST, false, error.code ?? error.message);
}
// 7. The pooler on tcp/5432 stays direct (a TCP open and close only: no startup packet, no login).
if (pooler) {
  const result = await tcpTry(pooler, 5432);
  emit('pooler-5432-direct', pooler, result === 'connected', result);
}

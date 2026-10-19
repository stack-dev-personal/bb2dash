// bb2dash :: docker/egress/egress.test.mjs
//
//   node --test docker/egress/egress.test.mjs
//
// Phase 25a (brief 119 item A, W-100): the egress proxy and its three clients, read from the files.
// It fails when:
//   * a client with a firewall (workspace, apply, workspace-ingest) has no HTTPS_PROXY, points at
//     another client's port, lacks NODE_USE_ENV_PROXY, or starts before egress is healthy;
//   * a firewall still opens tcp/443 (or DNS) to anything, or allows a port other than its own;
//   * squid.conf lets a port reach a name off its list, splices without the SNI matching the CONNECT
//     host, or bumps (decrypts) anything;
//   * the egress service gains a capability, a secret, a volume, a published port or a writable root,
//     or leaves its profiles;
//   * the Squid pin moves without this file moving with it.
// What it does not prove: that Squid and the kernel do what the files say. docker/egress/e2e/run-e2e.sh
// does that, with the real images.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(REPO, relative), 'utf8').replace(/\r\n/g, '\n');

const compose = read('compose.yaml');
const squid = read('docker/egress/squid.conf');
const dockerfile = read('docker/egress/Dockerfile');

const PROJECT_HOST = 'goultdzqcavefcgnifdy.supabase.co';
const API_HOST = 'api.anthropic.com';

/** Each client of the proxy: its port, its Squid port name, its firewall and the names its port may reach. */
const CLIENTS = Object.freeze([
  { service: 'workspace', port: 3128, portName: 'workspace', firewall: 'docker/workspace/init-firewall.sh', names: [API_HOST, PROJECT_HOST] },
  { service: 'apply', port: 3129, portName: 'apply', firewall: 'docker/apply/init-firewall.sh', names: [API_HOST, PROJECT_HOST] },
  { service: 'workspace-ingest', port: 3130, portName: 'ingest', firewall: 'docker/workspace-ingest/init-firewall.sh', names: [PROJECT_HOST] },
]);
/** Services left open on purpose (brief 119 question 2): no proxy, no firewall. */
const OPEN_SERVICES = Object.freeze(['sync', 'bb2dash-mcp']);

// --- compose.yaml, read the way docker/apply/image.test.mjs reads it ------------------------------

/** One service's block of compose.yaml: from its key to the next key at the same depth. */
function service(name) {
  const start = compose.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `compose.yaml has no ${name} service`);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n|\n[a-z]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The comment lines right above a service's key. */
function commentAbove(name) {
  const above = compose.slice(0, compose.indexOf(`\n  ${name}:\n`)).split('\n');
  const comment = [];
  while (above.length && above.at(-1).trim().startsWith('#')) comment.unshift(above.pop());
  return comment.join('\n');
}

/** The block without its comment lines, so a comment that names something is not a hit. */
const code = (block) => block.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');

/** A list under `key:` in a service block, as its items. */
function listOf(block, key) {
  const match = new RegExp(`\\n    ${key}:\\n((?:      - .*\\n)+)`).exec(code(block));
  return match ? match[1].trim().split('\n').map((line) => line.trim().replace(/^- /, '')) : [];
}

/** The service's environment as name -> value (quotes taken off). */
function environmentOf(block) {
  const match = /\n {4}environment:\n((?: {6}.*\n)+)/.exec(code(block));
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => /^ {6}([A-Z_][A-Z0-9_]*): (.*)$/.exec(line))
      .filter(Boolean)
      .map(([, name, value]) => [name, value.replace(/^"(.*)"$/, '$1')]),
  );
}

// --- squid.conf ------------------------------------------------------------------------------------

/** The config's directives, comments and blank lines dropped. */
const directives = squid
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

/** acl name -> { type, values } (every line of an acl joined). */
const acls = (() => {
  const map = new Map();
  for (const line of directives.filter((each) => each.startsWith('acl '))) {
    const [, name, type, ...values] = line.split(/\s+/);
    const known = map.get(name);
    if (known) {
      assert.equal(known.type, type, `acl ${name} is one type`);
      known.values.push(...values);
    } else {
      map.set(name, { type, values });
    }
  }
  return map;
})();
const aclValues = (name, type) => {
  const acl = acls.get(name);
  assert.ok(acl, `squid.conf defines acl ${name}`);
  assert.equal(acl.type, type, `acl ${name} is ${type}`);
  return [...acl.values].sort();
};
const lines = (directive) => directives.filter((line) => line.startsWith(`${directive} `)).map((line) => line.split(/\s+/).slice(1));

// --- the tests -------------------------------------------------------------------------------------

test('the image: Squid 6.13 with OpenSSL, both pinned exactly, run as proxy, no key baked in', () => {
  assert.match(dockerfile, /^FROM debian:13\.7-slim$/m);
  assert.match(dockerfile, /^ARG SQUID_VERSION=6\.13-2\+deb13u3$/m);
  assert.match(dockerfile, /"squid-openssl=\$\{SQUID_VERSION\}"/);
  assert.match(dockerfile, /^USER proxy$/m);
  // The parse-only certificate is made and removed in one RUN, so no layer keeps a key.
  const parseRun = dockerfile.replace(/\\\n/g, ' ').split('\n').find((line) => line.includes('squid -k parse'));
  assert.ok(parseRun && /rm -rf \/run\/egress/.test(parseRun), 'the parse-only key is removed in the layer that made it');
  assert.doesNotMatch(dockerfile, /^(ARG|ENV)\s+\S*(TOKEN|SECRET|PASSWORD|KEY)/m);
  assert.match(read('docker/egress/entrypoint.sh'), /openssl req -x509[\s\S]*?-keyout "\$CERT_FILE"/);
});

test('squid.conf: one port per client, each named, peek-and-splice only (no port decrypts)', () => {
  const ports = lines('http_port');
  assert.deepEqual(ports.map(([port]) => port), CLIENTS.map((client) => String(client.port)));
  for (const [at, client] of CLIENTS.entries()) {
    const options = ports[at].slice(1);
    assert.ok(options.includes('ssl-bump'), `port ${client.port} peeks`);
    assert.ok(options.includes(`name=${client.portName}`), `port ${client.port} is named ${client.portName}`);
    assert.ok(options.includes('generate-host-certificates=off'), `port ${client.port} mints no certificates`);
    assert.deepEqual(aclValues(`port_${client.portName}`, 'myportname'), [client.portName]);
  }
  const bump = lines('ssl_bump').map((words) => words.join(' '));
  assert.equal(bump[0], 'peek step1');
  assert.equal(bump.at(-1), 'terminate all');
  for (const rule of bump) assert.match(rule, /^(peek step1|splice \S+ \S+|terminate all)$/, `no stare, bump, client-first or server-first: ${rule}`);
  assert.deepEqual(aclValues('step1', 'at_step'), ['SslBump1']);
});

test('squid.conf: a splice needs the CONNECT host AND the same name as SNI, on one line', () => {
  const splices = lines('ssl_bump').filter(([action]) => action === 'splice');
  assert.ok(splices.length >= 1);
  const spliced = [];
  for (const [, connectAcl, sniAcl, ...rest] of splices) {
    assert.deepEqual(rest, [], 'two acls a splice line, nothing else');
    const connect = aclValues(connectAcl, 'dstdomain');
    const sni = aclValues(sniAcl, 'ssl::server_name');
    assert.equal(connect.length, 1, `${connectAcl} names one host`);
    assert.deepEqual(sni, connect, `${sniAcl} is the same one name as ${connectAcl}`);
    assert.ok(!connect[0].startsWith('.'), `exact names only, no subdomain wildcard: ${connect[0]}`);
    spliced.push(connect[0]);
  }
  assert.deepEqual(spliced.sort(), [API_HOST, PROJECT_HOST].sort());
});

test('squid.conf: each port reaches its own names and nothing else; every other request is refused', () => {
  const access = lines('http_access').map((words) => words.join(' '));
  assert.deepEqual(access, [
    'deny !CONNECT',
    'deny CONNECT !SSL_ports',
    'deny private_dst',
    ...CLIENTS.map((client) => `allow CONNECT port_${client.portName} names_${client.portName}`),
    'deny refused_by_default',
  ]);
  for (const client of CLIENTS) assert.deepEqual(aclValues(`names_${client.portName}`, 'dstdomain'), [...client.names].sort(), client.service);
  assert.deepEqual(aclValues('SSL_ports', 'port'), ['443']);
  assert.deepEqual(aclValues('refused_by_default', 'src'), ['all']);
  for (const range of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', 'fc00::/7', 'fe80::/10']) {
    assert.ok(aclValues('private_dst', 'dst').includes(range), `private_dst refuses ${range}`);
  }
  assert.ok(!directives.some((line) => /^(cache_peer|always_direct|never_direct|sslproxy_|tls_outgoing_options)/.test(line)), 'no upstream and no outgoing TLS settings');
  assert.match(squid, /^access_log stdio:\/dev\/stdout egress$/m);
});

test('compose: the egress service holds nothing, can write nothing, and starts only with its clients', () => {
  const block = service('egress');
  const body = code(block);
  assert.match(body, /^ {4}profiles: \[workspace, apply\]$/m);
  assert.match(body, /^ {4}image: bb2dash-egress:local$/m);
  assert.match(body, /^ {4}user: proxy$/m);
  assert.match(body, /^ {4}read_only: true$/m);
  assert.match(body, /^ {4}cap_drop: \[ALL\]$/m);
  assert.deepEqual(listOf(block, 'security_opt'), ['no-new-privileges:true']);
  assert.deepEqual(listOf(block, 'networks'), ['workspace-net', 'apply-net', 'ingest-net']);
  for (const forbidden of ['cap_add', 'secrets:', 'volumes:', 'ports:', 'network_mode', 'privileged', 'docker.sock', 'environment:']) {
    assert.ok(!body.includes(forbidden), `the egress service names ${forbidden}`);
  }
  assert.match(body, /test: \["CMD", "\/usr\/local\/bin\/egress-healthcheck"\]/);
  assert.match(body, /context: \.\/docker\/egress/);
});

test('compose: every client with a firewall sends HTTPS to its own egress port and waits for egress', () => {
  for (const client of CLIENTS) {
    const block = service(client.service);
    const env = environmentOf(block);
    assert.equal(env.HTTPS_PROXY, `http://egress:${client.port}`, `${client.service}: HTTPS_PROXY`);
    assert.equal(env.NODE_USE_ENV_PROXY, '1', `${client.service}: NODE_USE_ENV_PROXY makes Node's fetch read it`);
    assert.equal(env.NO_PROXY, 'localhost,127.0.0.1', `${client.service}: only loopback stays direct`);
    assert.equal(env.HTTP_PROXY, undefined, `${client.service}: no plain-HTTP proxy`);
    assert.match(code(block), /\n {4}depends_on:\n {6}egress:\n {8}condition: service_healthy\n {8}restart: true\n/, `${client.service} waits for egress`);
    const firewall = read(client.firewall);
    assert.match(firewall, new RegExp(`^readonly EGRESS_PORT=${client.port}$`, 'm'), `${client.firewall} allows the port compose names`);
  }
});

test('compose: the services left open are named open and carry no proxy setting', () => {
  for (const name of OPEN_SERVICES) {
    const block = service(name);
    assert.ok(!/PROXY/.test(code(block)), `${name} has no proxy setting`);
    assert.match(commentAbove(name), /Egress OPEN \(Phase 25a/, `${name} is named open in the comment above it`);
  }
  assert.match(commentAbove('egress'), /`sync`.*`bb2dash-mcp`.*`harness-jobs`/s, 'the comment above egress names what stays open');
});

test('each firewall: nothing on tcp/443, DNS refused, and only its own proxy port open', () => {
  for (const client of CLIENTS) {
    // main() only: deny_all, the failure path, keeps loopback open on purpose; it is tested in
    // docker/workspace/init-firewall.test.mjs.
    const source = read(client.firewall);
    const live = source
      .slice(source.indexOf('\nmain() {'))
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    const accepts = live.split('\n').filter((line) => /iptables -A OUTPUT .*-j ACCEPT/.test(line));
    assert.deepEqual(
      accepts.map((line) => line.trim()),
      [
        'iptables -A OUTPUT -o lo -j ACCEPT',
        'iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT',
        'iptables -A OUTPUT -p tcp --dport "$EGRESS_PORT" -m set --match-set "$EGRESS_SET" dst -j ACCEPT',
        'iptables -A OUTPUT -p tcp --dport "$POSTGRES_PORT" -m set --match-set "$POSTGRES_SET" dst -j ACCEPT',
      ],
      `${client.firewall}: the only accepts`,
    );
    assert.doesNotMatch(live, /443.*-j ACCEPT|HTTPS_HOSTS|HTTPS_PORT|--dport 53/, `${client.firewall}: no 443 and no DNS accept`);
    assert.match(live, /iptables -A OUTPUT -d "\$resolver" -j REJECT --reject-with icmp-admin-prohibited/, `${client.firewall}: DNS refused`);
    const rejectAt = live.indexOf('-d "$resolver" -j REJECT');
    assert.ok(rejectAt !== -1 && rejectAt < live.indexOf('iptables -A OUTPUT -o lo -j ACCEPT'), `${client.firewall}: DNS refused before loopback`);
    assert.match(source, /^readonly EGRESS_HOST=egress$/m);
  }
});

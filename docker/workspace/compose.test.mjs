// bb2dash :: docker/workspace/compose.test.mjs
//
//   node --test docker/workspace/compose.test.mjs
//
// Phase 25b (brief 119 item D, W-103): the two Workspace runners in compose.yaml. `workspace-2`
// extends `workspace`, so the two cannot drift; this file pins the few keys that differ and, when a
// Docker CLI is on PATH, reads compose's own rendering of the file to prove what the extension gives:
// the same service in every key but the runner's name, the build and the pull policy, and no network
// or volume shared with `sync`'s Blackboard login by any service that holds the Claude token.
// The rendering is `docker compose config`: it reads files only (dummy secret files in a scratch
// folder), asks no daemon, starts nothing. Without a Docker CLI those tests are skipped and say so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = fs.readFileSync(path.join(REPO, 'compose.yaml'), 'utf8').replace(/\r\n/g, '\n');

const RUNNERS = Object.freeze({ workspace: 'workspace', 'workspace-2': 'workspace-2' });
/** The keys `workspace-2` sets itself; everything else comes from `workspace`. */
const OWN_KEYS = Object.freeze(['build', 'pull_policy', 'environment.WORKSPACE_RUNNER_NAME']);
/** workspace/src/config.ts, RUNNER_NAME_SHAPE. */
const RUNNER_NAME_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
/** What `sync` holds that no Claude process may share: its login volume and its file volume. */
const LOGIN_VOLUMES = Object.freeze(['bb-profile', 'course-files']);
const CLAUDE_TOKEN = 'claude_oauth_token';

/** One service's block: from its key to the next key at the same depth (docker/apply/image.test.mjs's reader). */
function service(name) {
  const start = compose.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `compose.yaml has no ${name} service`);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n|\n[a-z]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}
const code = (block) => block.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#')).join('\n');

test('workspace-2 extends workspace and sets only its name, no build and pull_policy never', () => {
  assert.equal(
    code(service('workspace-2')),
    [
      '  workspace-2:',
      '    extends:',
      '      service: workspace',
      '    build: !reset null',
      '    pull_policy: never',
      '    environment:',
      '      WORKSPACE_RUNNER_NAME: workspace-2',
    ].join('\n'),
  );
});

test('each runner has its own fixed name, in the shape the runner accepts', () => {
  assert.match(code(service('workspace')), /\n {4}environment:\n(?: {6}.*\n)*? {6}WORKSPACE_RUNNER_NAME: workspace\n/);
  for (const name of Object.values(RUNNERS)) assert.match(name, RUNNER_NAME_SHAPE);
  assert.equal(new Set(Object.values(RUNNERS)).size, Object.keys(RUNNERS).length, 'the names differ');
  // The name never comes from the container: no hostname or container_name pins one instead.
  for (const name of Object.keys(RUNNERS)) {
    assert.doesNotMatch(code(service(name)), /\n {4}(hostname|container_name):/, `${name} sets no hostname`);
  }
});

test('nothing else extends the Workspace, and workspace-2 publishes nothing', () => {
  const extenders = [...compose.matchAll(/\n {4}extends:\n {6}service: ([a-z0-9-]+)\n/g)].map((m) => m[1]);
  assert.deepEqual(extenders, ['workspace']);
  assert.doesNotMatch(code(service('workspace-2')), /ports:|volumes:|networks:|secrets:|cap_add:|privileged/);
});

// --- compose's own rendering ---------------------------------------------------------------------

function render() {
  const probe = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) return { skip: 'no docker compose on PATH' };
  const secrets = fs.mkdtempSync(path.join(os.tmpdir(), 'w103-secrets-'));
  try {
    for (const name of compose.slice(compose.indexOf('\nsecrets:\n')).matchAll(/\n {2}([a-z0-9_]+):\n {4}file: /g)) {
      fs.writeFileSync(path.join(secrets, name[1]), 'not-a-secret\n');
    }
    const result = spawnSync(
      'docker',
      ['compose', '-p', 'bb2dash-compose-test', '--profile', 'workspace', '--profile', 'apply', '-f', 'compose.yaml', 'config', '--format', 'json'],
      { cwd: REPO, encoding: 'utf8', windowsHide: true, env: { ...process.env, SECRETS_DIR: secrets, COMPOSE_PROFILES: '' } },
    );
    assert.equal(result.status, 0, `docker compose config failed: ${result.stderr}`);
    return { services: JSON.parse(result.stdout).services };
  } finally {
    fs.rmSync(secrets, { recursive: true, force: true });
  }
}
const rendered = render();
const skip = rendered.skip ?? false;

/** A copy of a rendered service without the keys `workspace-2` sets itself. */
function withoutOwnKeys(spec) {
  const copy = structuredClone(spec);
  for (const key of OWN_KEYS) {
    const [head, tail] = key.split('.');
    if (tail) delete copy[head][tail];
    else delete copy[key];
  }
  return copy;
}

test('rendered: workspace-2 is workspace in every key but its name, its build and its pull policy', { skip }, () => {
  const { workspace, 'workspace-2': second } = rendered.services;
  assert.deepEqual(withoutOwnKeys(second), withoutOwnKeys(workspace));
  assert.equal(workspace.environment.WORKSPACE_RUNNER_NAME, RUNNERS.workspace);
  assert.equal(second.environment.WORKSPACE_RUNNER_NAME, RUNNERS['workspace-2']);
  assert.ok(workspace.build, 'workspace builds the image');
  assert.equal(second.build, undefined, 'workspace-2 builds nothing');
  assert.equal(second.pull_policy, 'never');
  assert.equal(second.image, 'bb2dash-workspace:local');
});

test('rendered: workspace-2 is the same egress client as workspace, with the memory jobs on', { skip }, () => {
  const second = rendered.services['workspace-2'];
  assert.equal(second.environment.HTTPS_PROXY, 'http://egress:3128');
  assert.equal(second.environment.NODE_USE_ENV_PROXY, '1');
  assert.equal(second.environment.WORKSPACE_MEMORY_JOBS, 'on');
  assert.deepEqual(Object.keys(second.networks), ['workspace-net']);
  assert.equal(second.depends_on.egress.condition, 'service_healthy');
  assert.deepEqual(second.profiles, ['workspace']);
  assert.deepEqual(second.tmpfs, ['/home/node/.claude:uid=1000,gid=1000,mode=0700,size=64m']);
  assert.deepEqual(second.secrets.map((s) => s.source).sort(), ['bb2dash_mcp_service_key', CLAUDE_TOKEN, 'workspace_runner_db_url']);
  assert.equal(second.ports, undefined);
});

test('rendered: no service that holds the Claude token shares a network or a volume with sync', { skip }, () => {
  const { services } = rendered;
  const syncNetworks = Object.keys(services.sync.networks ?? { default: null });
  const holders = Object.entries(services).filter(([, spec]) => (spec.secrets ?? []).some((s) => s.source === CLAUDE_TOKEN));
  assert.deepEqual(holders.map(([name]) => name).sort(), ['apply', 'workspace', 'workspace-2']);
  for (const [name, spec] of holders) {
    const networks = Object.keys(spec.networks ?? { default: null });
    assert.deepEqual(networks.filter((n) => syncNetworks.includes(n)), [], `${name} shares a network with sync`);
    const volumes = (spec.volumes ?? []).map((v) => v.source);
    assert.deepEqual(volumes.filter((v) => LOGIN_VOLUMES.includes(v)), [], `${name} mounts sync's volumes`);
  }
});

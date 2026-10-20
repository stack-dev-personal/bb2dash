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

/** The live project (compose.yaml's `name:`, and bb2dash-stack's) and the runner names it gives. */
const LIVE_PROJECT = 'bb2dash';
const RUNNERS = Object.freeze({ workspace: 'bb2dash-workspace', 'workspace-2': 'bb2dash-workspace-2' });
/** How compose.yaml spells each name: the project's name first (review R2-2). */
const NAME_LINES = Object.freeze({
  workspace: 'WORKSPACE_RUNNER_NAME: ${COMPOSE_PROJECT_NAME}-workspace',
  'workspace-2': 'WORKSPACE_RUNNER_NAME: ${COMPOSE_PROJECT_NAME}-workspace-2',
});
/** A test project as Phase 24 and 25a ran them: its own name and a second file of test tags. */
const TEST_PROJECT = 'bb2dash-p25b-test';
const TEST_OVERRIDE = 'docker/egress/e2e/compose.e2e.yaml';
/** The keys `workspace-2` sets itself; everything else comes from `workspace`. */
const OWN_KEYS = Object.freeze(['build', 'pull_policy', 'environment.WORKSPACE_RUNNER_NAME']);
/** workspace/src/config.ts, RUNNER_NAME_SHAPE. */
const RUNNER_NAME_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
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

/** Every file under the repository with one of `extensions`, node_modules and .git left out. */
function filesUnder(dir, extensions) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

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
      `      ${NAME_LINES['workspace-2']}`,
    ].join('\n'),
  );
});

test('each runner name is the compose project\'s name and the service\'s, fixed, in the shape the runner accepts', () => {
  assert.match(compose, new RegExp(`^name: ${LIVE_PROJECT}$`, 'm'));
  assert.ok(code(service('workspace')).includes(`\n    environment:\n`));
  assert.equal(code(service('workspace')).split('\n').filter((line) => line.includes('WORKSPACE_RUNNER_NAME')).map((l) => l.trim()).join(), NAME_LINES.workspace);
  for (const name of Object.values(RUNNERS)) assert.match(name, RUNNER_NAME_SHAPE);
  assert.equal(new Set(Object.values(RUNNERS)).size, Object.keys(RUNNERS).length, 'the names differ');
  // The name never comes from the container: no hostname or container_name pins one instead.
  for (const name of Object.keys(RUNNERS)) {
    assert.doesNotMatch(code(service(name)), /\n {4}(hostname|container_name):/, `${name} sets no hostname`);
  }
});

test('no compose file, script or env file but compose.yaml sets a runner name or the project name for it', () => {
  const setters = filesUnder(REPO, ['.yaml', '.yml', '.sh', '.ps1', '.mjs', '.env', '.example'])
    .filter((file) => path.relative(REPO, file) !== 'compose.yaml' && !file.endsWith('compose.test.mjs'))
    .filter((file) => /WORKSPACE_RUNNER_NAME\s*[:=]|COMPOSE_PROJECT_NAME\s*[:=]/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(REPO, file).replaceAll('\\', '/'));
  assert.deepEqual(setters, [], 'a test override must not pin the live names');
});

test('nothing else extends the Workspace, and workspace-2 publishes nothing', () => {
  const extenders = [...compose.matchAll(/\n {4}extends:\n {6}service: ([a-z0-9-]+)\n/g)].map((m) => m[1]);
  assert.deepEqual(extenders, ['workspace']);
  assert.doesNotMatch(code(service('workspace-2')), /ports:|volumes:|networks:|secrets:|cap_add:|privileged/);
});

// --- compose's own rendering ---------------------------------------------------------------------

/** `docker compose config` of compose.yaml (and `extra` files) under `project` (null: compose.yaml's own name). */
function render(project, extra = []) {
  const probe = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) return { skip: 'no docker compose on PATH' };
  const secrets = fs.mkdtempSync(path.join(os.tmpdir(), 'w103-secrets-'));
  try {
    for (const name of compose.slice(compose.indexOf('\nsecrets:\n')).matchAll(/\n {2}([a-z0-9_]+):\n {4}file: /g)) {
      fs.writeFileSync(path.join(secrets, name[1]), 'not-a-secret\n');
    }
    const env = { ...process.env, SECRETS_DIR: secrets, COMPOSE_PROFILES: '' };
    delete env.COMPOSE_PROJECT_NAME;
    const files = ['compose.yaml', ...extra].flatMap((file) => ['-f', file]);
    const result = spawnSync(
      'docker',
      ['compose', ...(project ? ['-p', project] : []), '--profile', 'workspace', '--profile', 'apply', ...files, 'config', '--format', 'json'],
      { cwd: REPO, encoding: 'utf8', windowsHide: true, env },
    );
    assert.equal(result.status, 0, `docker compose config failed: ${result.stderr}`);
    return { services: JSON.parse(result.stdout).services };
  } finally {
    fs.rmSync(secrets, { recursive: true, force: true });
  }
}
const rendered = render(null);
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

test('rendered: a test project, with its second file of test tags, never claims under a live name (R2-2)', { skip }, () => {
  const test = render(TEST_PROJECT, [TEST_OVERRIDE]).services;
  const live = new Set(Object.values(RUNNERS));
  for (const name of Object.keys(RUNNERS)) {
    const runner = test[name].environment.WORKSPACE_RUNNER_NAME;
    assert.equal(runner, `${TEST_PROJECT}-${name}`);
    assert.ok(!live.has(runner), `${name} in ${TEST_PROJECT} claims as ${runner}`);
    assert.match(runner, RUNNER_NAME_SHAPE);
  }
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

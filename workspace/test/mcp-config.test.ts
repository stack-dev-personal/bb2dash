import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { PATHS } from '../src/config.js';
import {
  MCP_CONFIG_MODE,
  buildMcpConfig,
  buildNoServerConfig,
  configText,
  removeRequestConfig,
  requestConfigPath,
  turnLimits,
  writeNoServerConfig,
  writeRequestConfig,
} from '../src/mcp-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.resolve(HERE, '..', 'claude', 'settings.json');

const temps: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w64-mcp-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the in-image layout (the seam with the image)', () => {
  it('names the runner package paths', () => {
    expect(PATHS.runDir).toBe('/run/workspace');
    expect(PATHS.mcpNone).toBe('/run/workspace/mcp-none.json');
    expect(PATHS.batchEntry).toBe('/app/mcp-materials/dist/batch.js');
    expect(PATHS.promptsDir).toBe('/app/workspace/prompts');
    expect('mcpConfig' in PATHS).toBe(false);
    expect(PATHS.aliveFile).toBe('/run/workspace/alive');
    expect(PATHS.settings).toBe('/app/workspace/claude/settings.json');
    expect(PATHS.systemPrompt).toBe('/app/workspace/prompts/system.md');
    expect(PATHS.turnCwd).toBe('/app/turn');
    expect(PATHS.runnerDbUrlSecret).toBe('/run/secrets/workspace_runner_db_url');
    expect(PATHS.oauthTokenSecret).toBe('/run/secrets/claude_oauth_token');
  });

  it('wires the hook command the image builds', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(settings.hooks.PreToolUse[0]?.hooks[0]?.command).toBe('node /app/workspace/dist/hooks/tool-gate.js');
  });

  it('builds the three entry files the image runs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'package.json'), 'utf8')) as { scripts: Record<string, string>; type: string };
    const tsconfig = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'tsconfig.json'), 'utf8')) as {
      compilerOptions: { rootDir: string; outDir: string };
      include: string[];
    };
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.build).toBe('tsc -p tsconfig.json');
    expect(tsconfig.compilerOptions.rootDir).toBe('src');
    expect(tsconfig.compilerOptions.outDir).toBe('dist');
    expect(tsconfig.include).toEqual(['src/**/*.ts']);
    for (const source of ['runner.ts', 'healthcheck.ts', 'search-probe.ts', path.join('hooks', 'tool-gate.ts'), path.join('propose', 'planner-server.ts')]) {
      expect(fs.existsSync(path.resolve(HERE, '..', 'src', source)), source).toBe(true);
    }
  });
});

const SOCKET = '/run/workspace/propose-41.sock';

describe('the answering turn MCP config', () => {
  const limits = turnLimits(true, ['BIO.110', 'BIO.110.lab']);
  const config = buildMcpConfig(limits, SOCKET, {});

  it('holds exactly two servers, bb2dash and planner: the notes server is gone', () => {
    expect(Object.keys(config)).toEqual(['mcpServers']);
    expect(Object.keys(config.mcpServers)).toEqual(['bb2dash', 'planner']);
    expect(JSON.stringify(config)).not.toContain('rag');
  });

  it('starts the planner tool server by path with the turn socket and the limit of 5, and nothing else in its env', () => {
    expect(PATHS.plannerServer).toBe('/app/workspace/dist/propose/planner-server.js');
    expect(config.mcpServers.planner).toEqual({
      command: 'node',
      args: ['/app/workspace/dist/propose/planner-server.js'],
      env: { WORKSPACE_PROPOSE_SOCKET: '/run/workspace/propose-41.sock', WORKSPACE_PROPOSE_LIMIT: '5' },
    });
    const proxied = buildMcpConfig(limits, SOCKET, { HTTPS_PROXY: 'http://egress:3128', NODE_USE_ENV_PROXY: '1' });
    expect(proxied.mcpServers.planner?.env).toEqual(config.mcpServers.planner?.env);
  });

  it('names the planner entry file among the ones the image builds', () => {
    expect(fs.existsSync(path.resolve(HERE, '..', 'src', 'propose', 'planner-server.ts'))).toBe(true);
  });

  it('starts the materials server by path, its key named by file, with the turn limits in its env', () => {
    expect(config.mcpServers.bb2dash).toEqual({
      command: 'node',
      args: ['/app/mcp-materials/dist/index.js'],
      env: {
        SUPABASE_URL: 'https://goultdzqcavefcgnifdy.supabase.co',
        SUPABASE_SERVICE_ROLE_FILE: '/run/secrets/bb2dash_mcp_service_key',
        BB2DASH_MAX_SEARCHES: '3',
        BB2DASH_MAX_READS: '10',
        BB2DASH_COURSES: 'BIO.110,BIO.110.lab',
      },
    });
  });

  it('allows 3 searches after a planning turn and 4 without one, and 10 reads either way', () => {
    expect(turnLimits(true, null)).toEqual({ maxSearches: 3, maxReads: 10, courses: null });
    expect(turnLimits(false, null)).toEqual({ maxSearches: 4, maxReads: 10, courses: null });
  });

  it('names no course when the request has no scope', () => {
    for (const courses of [null, []]) {
      const env = buildMcpConfig(turnLimits(true, courses), SOCKET).mcpServers.bb2dash?.env ?? {};
      expect('BB2DASH_COURSES' in env).toBe(false);
    }
  });

  it('holds paths and numbers only: no DSN, no key and no token shape', () => {
    const text = configText(config);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toMatch(/sb_secret_/);
    expect(text).not.toMatch(/eyJ/);
    expect(text).not.toMatch(/sk-ant-/);
    expect(text).not.toMatch(/DATABASE_URL/);
    expect(JSON.parse(text)).toEqual(config);
  });
});

describe('the config with no server', () => {
  it('names no server at all', () => {
    expect(buildNoServerConfig()).toEqual({ mcpServers: {} });
    expect(configText(buildNoServerConfig())).toBe('{\n  "mcpServers": {}\n}\n');
  });

  it('is written at start to /run/workspace/mcp-none.json, mode 0600', () => {
    const calls: Array<{ what: string; file: string; mode: unknown }> = [];
    writeNoServerConfig(undefined, {
      writeFileSync: (file, _text, options) => calls.push({ what: 'write', file, mode: options.mode }),
      chmodSync: (file, mode) => calls.push({ what: 'chmod', file, mode }),
    });
    expect(MCP_CONFIG_MODE).toBe(0o600);
    expect(calls).toEqual([
      { what: 'write', file: '/run/workspace/mcp-none.json', mode: 0o600 },
      { what: 'chmod', file: '/run/workspace/mcp-none.json', mode: 0o600 },
    ]);
  });
});

describe('a request config file', () => {
  it('is /run/workspace/mcp-<request id>.json', () => {
    expect(requestConfigPath('4812')).toBe('/run/workspace/mcp-4812.json');
  });

  it.each([['../etc/passwd'], ['41/../x'], ['0'], ['07'], [''], ['4 1'], ['41.json']])('never turns %j into a path', (id) => {
    expect(() => requestConfigPath(id)).toThrow(/request id/);
  });

  it('is written with mode 0600, holds the config, and is removed after the turn', () => {
    const dir = tempDir();
    const file = writeRequestConfig('77', turnLimits(false, ['MAT.221']), dir);
    expect(file).toBe(`${dir}/mcp-77.json`);
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as ReturnType<typeof buildMcpConfig>;
    expect(written).toEqual(buildMcpConfig(turnLimits(false, ['MAT.221']), `${dir}/propose-77.sock`));
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    removeRequestConfig(file);
    expect(fs.existsSync(file)).toBe(false);
    expect(() => removeRequestConfig(file)).not.toThrow();
  });

  it('asks for the mode on the write and again on the chmod', () => {
    const calls: Array<{ what: string; file: string; mode: unknown }> = [];
    writeRequestConfig('9', turnLimits(true, null), '/run/workspace', {
      writeFileSync: (file, _text, options) => calls.push({ what: 'write', file, mode: options.mode }),
      chmodSync: (file, mode) => calls.push({ what: 'chmod', file, mode }),
    });
    expect(calls).toEqual([
      { what: 'write', file: '/run/workspace/mcp-9.json', mode: 0o600 },
      { what: 'chmod', file: '/run/workspace/mcp-9.json', mode: 0o600 },
    ]);
  });

  it('names the request\'s own socket for the planner server', () => {
    let text = '';
    writeRequestConfig('9', turnLimits(true, null), '/run/workspace', {
      writeFileSync: (_file, written) => {
        text = written;
      },
      chmodSync: () => undefined,
    });
    expect((JSON.parse(text) as { mcpServers: { planner: { env: Record<string, string> } } }).mcpServers.planner.env.WORKSPACE_PROPOSE_SOCKET).toBe(
      '/run/workspace/propose-9.sock',
    );
  });
});

describe("the materials server's proxy settings (Phase 25a)", () => {
  it("carries the runner's HTTPS_PROXY, NO_PROXY and NODE_USE_ENV_PROXY, and nothing else of its env", () => {
    const env = buildMcpConfig(turnLimits(false, null), SOCKET, {
      HTTPS_PROXY: 'http://egress:3128',
      NO_PROXY: 'localhost,127.0.0.1',
      NODE_USE_ENV_PROXY: '1',
      CLAUDE_CODE_OAUTH_TOKEN: 'never-passed',
      PATH: '/usr/bin',
    }).mcpServers.bb2dash?.env;
    expect(env).toEqual({
      SUPABASE_URL: 'https://goultdzqcavefcgnifdy.supabase.co',
      SUPABASE_SERVICE_ROLE_FILE: '/run/secrets/bb2dash_mcp_service_key',
      HTTPS_PROXY: 'http://egress:3128',
      NO_PROXY: 'localhost,127.0.0.1',
      NODE_USE_ENV_PROXY: '1',
      BB2DASH_MAX_SEARCHES: '4',
      BB2DASH_MAX_READS: '10',
    });
  });

  it('leaves an empty setting out', () => {
    const env = buildMcpConfig(turnLimits(false, null), SOCKET, { HTTPS_PROXY: '', NODE_USE_ENV_PROXY: '1' }).mcpServers.bb2dash?.env ?? {};
    expect('HTTPS_PROXY' in env).toBe(false);
    expect(env.NODE_USE_ENV_PROXY).toBe('1');
  });
});

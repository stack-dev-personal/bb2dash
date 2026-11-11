/**
 * The MCP configs the CLI is started with (`--strict-mcp-config --mcp-config <file>`; brief 109,
 * Argv): an answering turn gets its own file, `/run/workspace/mcp-<request id>.json`, mode 0600,
 * with exactly two servers: the materials one, with the turn's limits in its `env`, and (Phase 25b) the
 * planner tool server, with the turn's socket and its limit of five proposals; the file is removed
 * after the turn. A planning, summary or rolling turn gets `/run/workspace/mcp-none.json`, which
 * names no server. Never a key, a token or a DSN: the materials server reads its key from the file
 * it is named. The paths are the seam with the image (`test/mcp-config.test.ts` pins them).
 *
 * The limits reach the materials server through its environment (`BB2DASH_MAX_SEARCHES`,
 * `BB2DASH_MAX_READS`, `BB2DASH_COURSES`), where it enforces them itself.
 */

import fs from 'node:fs';

import { MATERIALS_ENV, PATHS, proxyEnv } from './config.js';
import { proposeSocketPath } from './propose/channel.js';
import { PROPOSALS_PER_TURN, PROPOSE_LIMIT_ENV, PROPOSE_SOCKET_ENV } from './propose/protocol.js';

export const MCP_CONFIG_MODE = 0o600;

/** At most this many searches by the model: 3 after a planning turn, 4 when none ran. */
export const MAX_SEARCHES_PLANNED = 3;
export const MAX_SEARCHES_UNPLANNED = 4;
export const MAX_READS = 10;
const REQUEST_ID_SHAPE = /^[1-9][0-9]{0,18}$/;

export interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface McpConfig {
  readonly mcpServers: { readonly bb2dash?: McpServerEntry; readonly planner?: McpServerEntry };
}

/** What the materials server is told to enforce on this turn. */
export interface TurnLimits {
  readonly maxSearches: number;
  readonly maxReads: number;
  /** The request's scope; null or empty for none. */
  readonly courses: readonly string[] | null;
}

/** The limits of an answering turn: 3 searches after a planning turn, 4 without one. */
export function turnLimits(planned: boolean, courses: readonly string[] | null): TurnLimits {
  return { maxSearches: planned ? MAX_SEARCHES_PLANNED : MAX_SEARCHES_UNPLANNED, maxReads: MAX_READS, courses };
}

const NO_SERVER_CONFIG: McpConfig = Object.freeze({ mcpServers: Object.freeze({}) });

/** The config with no server, for a planning, summary or rolling turn. */
export function buildNoServerConfig(): McpConfig {
  return NO_SERVER_CONFIG;
}

/**
 * The answering turn's config: the materials server, started by path, with the turn's limits and the
 * runner's proxy settings (Phase 25a: its fetch reaches the project host through the egress proxy only);
 * and the planner tool server (Phase 25b), which makes no network call and holds no credential: its env
 * is the turn's socket and the limit, nothing else.
 */
export function buildMcpConfig(
  limits: TurnLimits,
  proposeSocket: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): McpConfig {
  const scope: Record<string, string> = limits.courses === null || limits.courses.length === 0 ? {} : { BB2DASH_COURSES: limits.courses.join(',') };
  return {
    mcpServers: {
      // The class materials: search_materials and get_material_text.
      bb2dash: {
        command: 'node',
        args: ['/app/mcp-materials/dist/index.js'],
        env: {
          ...MATERIALS_ENV,
          ...proxyEnv(env),
          BB2DASH_MAX_SEARCHES: String(limits.maxSearches),
          BB2DASH_MAX_READS: String(limits.maxReads),
          ...scope,
        },
      },
      // Planner proposals: propose_planner_change. The runner files them; this server only forwards.
      planner: {
        command: 'node',
        args: [PATHS.plannerServer],
        env: { [PROPOSE_SOCKET_ENV]: proposeSocket, [PROPOSE_LIMIT_ENV]: String(PROPOSALS_PER_TURN) },
      },
    },
  };
}

export const configText = (config: McpConfig): string => `${JSON.stringify(config, null, 2)}\n`;

/** The per-request config's path; the request id is digits only, so it can never become a path. */
export function requestConfigPath(requestId: string, runDir: string = PATHS.runDir): string {
  if (!REQUEST_ID_SHAPE.test(requestId)) throw new Error('mcp-config: the request id is not a plain number');
  return `${runDir}/mcp-${requestId}.json`;
}

/** The file calls the writer makes, so a test can watch them. */
export interface McpConfigFs {
  writeFileSync(file: string, text: string, options: { mode: number }): unknown;
  chmodSync(file: string, mode: number): unknown;
  rmSync?(file: string, options: { force: true }): unknown;
}

/** Write a config, readable by the runner's user only. */
export function writeConfigFile(file: string, config: McpConfig, fileSystem: McpConfigFs = fs): void {
  fileSystem.writeFileSync(file, configText(config), { mode: MCP_CONFIG_MODE });
  // The mode given to a write applies only when it creates the file, so it is set again.
  fileSystem.chmodSync(file, MCP_CONFIG_MODE);
}

/** The runner's start: the config with no server, where the non-answering turns find it. */
export function writeNoServerConfig(file: string = PATHS.mcpNone, fileSystem: McpConfigFs = fs): void {
  writeConfigFile(file, NO_SERVER_CONFIG, fileSystem);
}

/** An answering turn's own file; returns its path. */
export function writeRequestConfig(requestId: string, limits: TurnLimits, runDir: string = PATHS.runDir, fileSystem: McpConfigFs = fs): string {
  const file = requestConfigPath(requestId, runDir);
  writeConfigFile(file, buildMcpConfig(limits, proposeSocketPath(requestId, runDir)), fileSystem);
  return file;
}

/** Remove an answering turn's file after the turn; a file that is not there is not an error. */
export function removeRequestConfig(file: string, fileSystem: McpConfigFs = fs): void {
  (fileSystem.rmSync ?? fs.rmSync)(file, { force: true });
}

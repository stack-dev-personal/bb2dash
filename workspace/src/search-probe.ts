/**
 * The index watch's probe (brief 119, item C, W-102):
 *   node /app/workspace/dist/search-probe.js
 *
 * Run by bb2dash-stack's doctor through `docker compose exec -T workspace`, the way its blackboard
 * row runs the sync's probe. It reads the runner's own two secrets as the runner does (the
 * `workspace_runner` DSN and the pinned CA), calls `workspace_search_timing()` (migration 207) once,
 * prints one JSON line and exits; the rules and the line are in `search-timing.ts`. It writes nothing,
 * starts no CLI and is never imported.
 */

import os from 'node:os';

import { loadConfig, readTextOrNull } from './config.js';
import { newPgClient } from './db.js';
import { PROBE_EXIT, measureSearch } from './search-timing.js';

measureSearch({
  loadDb: () => {
    const config = loadConfig({ env: process.env, readFile: readTextOrNull, hostname: os.hostname() });
    return { dsn: config.dbUrl, ca: config.dbCa };
  },
  newClient: newPgClient,
}).then(
  ({ line, exitCode }) => {
    process.stdout.write(`${JSON.stringify(line)}\n`);
    process.exitCode = exitCode;
  },
  () => {
    // measureSearch never throws; this is the line for the case it somehow did, with no detail that could hold a secret.
    process.stdout.write(`${JSON.stringify({ error: 'failed', message: 'the probe failed unexpectedly' })}\n`);
    process.exitCode = PROBE_EXIT.failed;
  },
);

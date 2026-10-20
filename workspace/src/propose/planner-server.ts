/**
 * The planner tool server (Phase 25b, E): `node /app/workspace/dist/propose/planner-server.js`, started
 * by the CLI for an answering turn from the turn's MCP config (`mcp-config.ts`, server `planner`).
 *
 * It holds no credential: its environment names the turn's socket (WORKSPACE_PROPOSE_SOCKET) and the
 * turn's limit (WORKSPACE_PROPOSE_LIMIT), nothing else. It writes nothing; the runner files the
 * proposal. stdout carries only JSON-RPC lines; anything else goes to stderr.
 *
 * This file runs on load and is never imported; the protocol is `planner-mcp.ts`.
 */

import readline from 'node:readline';

import { sendProposal } from './client.js';
import { createPlannerHandler } from './planner-mcp.js';
import { PROPOSALS_PER_TURN, PROPOSE_LIMIT_ENV, PROPOSE_SOCKET_ENV } from './protocol.js';

const EXIT_CONFIG = 2;

function limitOf(text: string | undefined): number {
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= PROPOSALS_PER_TURN ? n : 0;
}

const socketPath = process.env[PROPOSE_SOCKET_ENV] ?? '';
if (socketPath === '') {
  process.stderr.write(`planner: ${PROPOSE_SOCKET_ENV} is not set\n`);
  process.exit(EXIT_CONFIG);
}

const handler = createPlannerHandler({
  limit: limitOf(process.env[PROPOSE_LIMIT_ENV]),
  send: (input) => sendProposal(socketPath, input),
});

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
// One message at a time, in order: a second call waits for the first's reply.
let chain: Promise<void> = Promise.resolve();
lines.on('line', (line) => {
  if (line.trim() === '') return;
  chain = chain.then(async () => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`);
      return;
    }
    try {
      const answer = await handler.handle(message);
      if (answer !== null) process.stdout.write(`${JSON.stringify(answer)}\n`);
    } catch {
      process.stderr.write('planner: a message could not be handled\n');
      const id = typeof message === 'object' && message !== null ? (message as { id?: unknown }).id : undefined;
      if (typeof id === 'string' || typeof id === 'number') {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'internal error' } })}\n`);
      }
    }
  });
});
lines.on('close', () => {
  void chain.then(() => process.exit(0));
});

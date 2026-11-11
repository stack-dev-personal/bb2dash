/**
 * The runner's end of the planner proposal tool (Phase 25b, E; the contract `119b_PHASE25B_contract.md`,
 * "The tool"): a Unix socket, `/run/workspace/propose-<request id>.sock`, mode 0600, open for the length
 * of one answering turn. The credential-free tool server (`planner-server.ts`) sends one line, the five
 * fields the model wrote; this end checks their shape and calls `workspace_propose` (204) with the
 * turn's OWN request id and the runner's OWN name, which the model never supplies, and answers with the
 * function's row or the refusal's message. `/run/workspace` is the runner's alone (0700, `node`), so the
 * socket is reachable only by processes of the runner's user: the CLI and its MCP servers.
 *
 * A refusal the function raises itself (22023, or 54000 for a sixth proposal) goes back to the model as
 * it is; any other failure goes back as one fixed sentence and is logged, with nothing of the input.
 */

import fs from 'node:fs';
import net from 'node:net';

import { PATHS } from '../config.js';
import { messageOf } from '../errors.js';
import { MESSAGE_MAX_BYTES, messageLine, readProposeInput, type ProposalRow, type ProposeInput, type ProposeReply } from './protocol.js';

export const PROPOSE_SOCKET_MODE = 0o600;
/** A connection that has not sent its line by now is dropped. */
export const CONNECTION_IDLE_MS = 30_000;
/** The SQLSTATEs 204 raises itself: its refusals, and the sixth proposal of a request. */
const OWN_REFUSALS: ReadonlySet<string> = new Set(['22023', '54000']);
const NOT_FILED = 'the proposal could not be filed; nothing was changed';
const REQUEST_ID_SHAPE = /^[1-9][0-9]{0,18}$/;

/** The turn's socket; the request id is digits only, so it can never become another path. */
export function proposeSocketPath(requestId: string, runDir: string = PATHS.runDir): string {
  if (!REQUEST_ID_SHAPE.test(requestId)) throw new Error('propose: the request id is not a plain number');
  return `${runDir}/propose-${requestId}.sock`;
}

/** `workspace_propose`, as the runner calls it on its own connection. */
export type ProposeCall = (requestId: string, runner: string, input: ProposeInput) => Promise<ProposalRow>;

export interface ChannelFs {
  rmSync(file: string, options: { force: true }): unknown;
  chmodSync(file: string, mode: number): unknown;
}

export interface ChannelDeps {
  readonly socketPath: string;
  readonly requestId: string;
  readonly runner: string;
  readonly propose: ProposeCall;
  readonly log: (line: string) => void;
  readonly fs?: ChannelFs;
}

export interface ProposeChannel {
  /** Stop listening, drop every connection, remove the socket file. Never throws. */
  close(): Promise<void>;
}

const sqlStateOf = (error: unknown): string | null => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : null;
};

/** The reply for one line: the shape checked here, everything else by the function. */
async function replyFor(line: string, deps: ChannelDeps): Promise<ProposeReply> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, error: 'the message is not JSON' };
  }
  const read = readProposeInput(parsed);
  if (!read.ok) return { ok: false, error: read.reason };
  try {
    return { ok: true, proposal: await deps.propose(deps.requestId, deps.runner, read.input) };
  } catch (error) {
    const code = sqlStateOf(error);
    if (code !== null && OWN_REFUSALS.has(code)) return { ok: false, error: messageOf(error) };
    deps.log(`propose: workspace_propose failed (${code ?? 'no sqlstate'}): ${messageOf(error)}`);
    return { ok: false, error: NOT_FILED };
  }
}

/** One connection: one line in, one line out, then the end. */
function serve(socket: net.Socket, deps: ChannelDeps): void {
  let buffer = Buffer.alloc(0);
  let answered = false;
  const answer = (reply: ProposeReply): void => {
    if (answered) return;
    answered = true;
    socket.end(messageLine(reply));
  };
  socket.setTimeout(CONNECTION_IDLE_MS, () => socket.destroy());
  socket.on('error', () => socket.destroy());
  socket.on('data', (chunk: Buffer) => {
    if (answered) return;
    buffer = Buffer.concat([buffer, chunk]);
    const end = buffer.indexOf(0x0a);
    if (end === -1 && buffer.length <= MESSAGE_MAX_BYTES) return;
    if (end === -1 || end > MESSAGE_MAX_BYTES) {
      answer({ ok: false, error: 'the message is too long' });
      return;
    }
    const line = buffer.subarray(0, end).toString('utf8');
    answered = true;
    void replyFor(line, deps).then((reply) => {
      if (!socket.destroyed) socket.end(messageLine(reply));
    });
  });
}

/** How a turn opens its socket: the real one below, a fake in tests. */
export interface ProposalSockets {
  open(requestId: string): Promise<ProposeChannel>;
}

/** The runner's sockets: `/run/workspace/propose-<id>.sock`, answered with its own login, request id and name. */
export function realProposalSockets(propose: ProposeCall, runner: string, log: (line: string) => void): ProposalSockets {
  return {
    open: (requestId) => openProposeChannel({ socketPath: proposeSocketPath(requestId), requestId, runner, propose, log }),
  };
}

/** Listen on the turn's socket until `close()`. A stale file of the same name is removed first. */
export function openProposeChannel(deps: ChannelDeps): Promise<ProposeChannel> {
  const files = deps.fs ?? fs;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    serve(socket, deps);
  });
  const removeFile = (): void => {
    try {
      files.rmSync(deps.socketPath, { force: true });
    } catch (error) {
      deps.log(`propose: the socket file could not be removed: ${messageOf(error)}`);
    }
  };

  const close = async (): Promise<void> => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    removeFile();
  };

  return new Promise<ProposeChannel>((resolve, reject) => {
    let listening = false;
    server.on('error', (error) => {
      if (listening) {
        deps.log(`propose: the socket failed: ${messageOf(error)}`);
        return;
      }
      removeFile();
      reject(error);
    });
    removeFile();
    server.listen(deps.socketPath, () => {
      listening = true;
      try {
        files.chmodSync(deps.socketPath, PROPOSE_SOCKET_MODE);
      } catch (error) {
        void close().then(() => reject(error));
        return;
      }
      resolve({ close });
    });
  });
}

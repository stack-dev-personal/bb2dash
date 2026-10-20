/**
 * The tool server's end of the turn's socket (Phase 25b, E): one connection per call, one line out (the
 * five fields), one line back (the runner's reply). Holds nothing but the socket's path.
 */

import net from 'node:net';

import { MESSAGE_MAX_BYTES, messageLine, readProposeReply, type ProposeInput, type ProposeReply } from './protocol.js';

/** Longer than the runner's database call may take (its client gives up at 20 s). */
export const REPLY_TIMEOUT_MS = 30_000;

/** Send one proposal to the runner and wait for its reply; a transport failure is a reply with ok false. */
export function sendProposal(socketPath: string, input: ProposeInput, timeoutMs: number = REPLY_TIMEOUT_MS): Promise<ProposeReply> {
  return new Promise<ProposeReply>((resolve) => {
    let buffer = Buffer.alloc(0);
    let settled = false;
    const settle = (reply: ProposeReply): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reply);
    };
    const socket = net.createConnection(socketPath, () => socket.write(messageLine(input)));
    socket.setTimeout(timeoutMs, () => settle({ ok: false, error: 'the runner did not answer in time' }));
    socket.on('error', () => settle({ ok: false, error: 'the runner could not be reached' }));
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf(0x0a);
      if (end === -1) {
        if (buffer.length > MESSAGE_MAX_BYTES) settle({ ok: false, error: 'the runner\'s reply is too long' });
        return;
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(buffer.subarray(0, end).toString('utf8'));
      } catch {
        // Not JSON: read as no reply below.
      }
      settle(readProposeReply(parsed) ?? { ok: false, error: 'the runner\'s reply is not one' });
    });
    socket.on('end', () => settle({ ok: false, error: 'the runner closed the connection without a reply' }));
  });
}

/**
 * The planner proposal tool (Phase 25b, E): its input rules, the tool server's MCP answers and its
 * limit, and the runner's socket end to end (a real socket, a named pipe on Windows), with
 * `workspace_propose` faked.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openProposeChannel, proposeSocketPath, PROPOSE_SOCKET_MODE, type ProposeCall, type ProposeChannel } from '../src/propose/channel.js';
import { sendProposal } from '../src/propose/client.js';
import { createPlannerHandler, DEFAULT_PROTOCOL_VERSION } from '../src/propose/planner-mcp.js';
import {
  OFFERED_PLANNER_STATUSES,
  PLANNER_SERVER,
  PROPOSALS_PER_TURN,
  PROPOSE_CALLS_PER_TURN,
  PROPOSE_INPUT_SCHEMA,
  PROPOSE_TOOL,
  PROPOSE_TOOL_FULL,
  readProposeInput,
  type ProposeInput,
  type ProposeReply,
} from '../src/propose/protocol.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILT_SERVER = path.resolve(HERE, '..', 'dist', 'propose', 'planner-server.js');

const VALID: ProposeInput = {
  target: 'assignment_progress',
  row_id: 'ECN.304/ps-4',
  field: 'status',
  value: 'submitted',
  reason: 'He said he turned it in.',
};
const ROW = { proposal_id: '17', label: 'Problem Set 4', old_value: null, new_value: 'submitted' };

describe('the statuses the tool offers (119a R2-9)', () => {
  const WEB_STATUS_FILE = path.resolve(HERE, '..', '..', 'web', 'src', 'lib', 'progress-status.ts');

  /** The web's OFFERED_STATUSES, read from its source text: every status menu in the app reads it. */
  function webOffered(): string[] {
    const text = fs.readFileSync(WEB_STATUS_FILE, 'utf8');
    const body = /export const OFFERED_STATUSES = \[([^\]]*)\]/.exec(text)?.[1];
    expect(body, 'OFFERED_STATUSES in web/src/lib/progress-status.ts').toBeDefined();
    return [...(body ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1] ?? '');
  }

  it('are the web\'s offered statuses, in menu order', () => {
    expect(webOffered()).toEqual(['not_started', 'in_progress', 'submitted', 'graded', 'excused', 'missed']);
    expect([...OFFERED_PLANNER_STATUSES]).toEqual(webOffered());
  });

  it('are the list the tool description gives the model, and no retired status', () => {
    const description = PROPOSE_INPUT_SCHEMA.properties.value.description;
    expect(description).toContain(`For status one of ${webOffered().join(', ')};`);
    const listed = /For status one of ([^;]*);/.exec(description)?.[1] ?? '';
    expect(listed.split(', ')).toEqual(webOffered());
    expect(listed).not.toMatch(/\b(planned|waived|not_applicable)\b/);
  });
});

describe('the tool\'s names and input', () => {
  it('is mcp__planner__propose_planner_change, five a turn', () => {
    expect(PLANNER_SERVER).toBe('planner');
    expect(PROPOSE_TOOL).toBe('propose_planner_change');
    expect(PROPOSE_TOOL_FULL).toBe('mcp__planner__propose_planner_change');
    expect(PROPOSALS_PER_TURN).toBe(5);
  });

  it('has a closed JSON schema of the five fields', () => {
    expect(PROPOSE_INPUT_SCHEMA.additionalProperties).toBe(false);
    expect(PROPOSE_INPUT_SCHEMA.required).toEqual(['target', 'row_id', 'field', 'value', 'reason']);
    expect(Object.keys(PROPOSE_INPUT_SCHEMA.properties)).toEqual(['target', 'row_id', 'field', 'value', 'reason']);
    expect(PROPOSE_INPUT_SCHEMA.properties.target.enum).toEqual(['assignment_progress', 'reading_progress']);
    expect(PROPOSE_INPUT_SCHEMA.properties.field.enum).toEqual(['status', 'notes', 'planned_start', 'planned_finish']);
  });

  it('reads the five fields', () => {
    expect(readProposeInput(VALID)).toEqual({ ok: true, input: VALID });
    expect(readProposeInput({ ...VALID, target: 'reading_progress', row_id: '314', field: 'notes', value: 'n'.repeat(2000), reason: 'r'.repeat(500) }).ok).toBe(true);
  });

  it.each([
    ['not an object', 'x'],
    ['an array', [VALID]],
    ['an unknown field', { ...VALID, request_id: 41 }],
    ['a runner name smuggled in', { ...VALID, runner: 'other' }],
    ['a target outside the list', { ...VALID, target: 'assignments' }],
    ['a field outside the list', { ...VALID, field: 'score' }],
    ['a planned date on a reading', { ...VALID, target: 'reading_progress', field: 'planned_start' }],
    ['an empty row id', { ...VALID, row_id: '' }],
    ['a blank row id', { ...VALID, row_id: '   ' }],
    ['a row id of 201', { ...VALID, row_id: 'x'.repeat(201) }],
    ['a number for a value', { ...VALID, value: 3 }],
    ['an empty value', { ...VALID, value: '' }],
    ['a value of 2,001', { ...VALID, field: 'notes', value: 'n'.repeat(2001) }],
    ['a blank reason', { ...VALID, reason: ' ' }],
    ['a reason of 501', { ...VALID, reason: 'r'.repeat(501) }],
    ['a field missing', { target: VALID.target, row_id: VALID.row_id, field: VALID.field, value: VALID.value }],
  ])('refuses %s', (_what, value) => {
    expect(readProposeInput(value).ok).toBe(false);
  });
});

describe('the tool server\'s MCP answers', () => {
  function handler(replies: ProposeReply[] = [], limit = PROPOSALS_PER_TURN) {
    const sent: ProposeInput[] = [];
    const h = createPlannerHandler({
      limit,
      send: async (input) => {
        sent.push(input);
        return replies.shift() ?? { ok: true, proposal: ROW };
      },
    });
    return { h, sent };
  }
  const call = (id: number, args: unknown, name = PROPOSE_TOOL) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

  it('answers initialize with its name and the client\'s protocol version', async () => {
    const { h } = handler();
    expect(await h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'planner', version: '1.0.0' } },
    });
    const bare = await h.handle({ jsonrpc: '2.0', id: 2, method: 'initialize' });
    expect((bare?.result as { protocolVersion: string }).protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
  });

  it('lists the one tool with its schema', async () => {
    const { h } = handler();
    const listed = (await h.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' }))?.result as { tools: Array<{ name: string; inputSchema: unknown; description: string }> };
    expect(listed.tools.map((tool) => tool.name)).toEqual(['propose_planner_change']);
    expect(listed.tools[0]?.inputSchema).toEqual(PROPOSE_INPUT_SCHEMA);
    expect(listed.tools[0]?.description).toMatch(/Nothing is changed/);
  });

  it('answers no notification, ping with {}, and an unknown method as not found', async () => {
    const { h } = handler();
    expect(await h.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(await h.handle({ jsonrpc: '2.0', id: 4, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 4, result: {} });
    expect((await h.handle({ jsonrpc: '2.0', id: 5, method: 'resources/list' }))?.error).toMatchObject({ code: -32601 });
    expect((await h.handle({ id: 6, method: 'ping' }))?.error).toMatchObject({ code: -32600 });
  });

  it('forwards a valid call and shows the row, saying nothing is changed yet', async () => {
    const { h, sent } = handler();
    const answer = (await h.handle(call(7, VALID)))?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(sent).toEqual([VALID]);
    expect(answer.isError).toBe(false);
    expect(answer.content[0]?.text).toMatch(/^Proposed \(proposal 17\) for "Problem Set 4"\. Nothing is changed yet/);
    expect(answer.content[0]?.text).toContain(JSON.stringify(ROW));
  });

  it('answers a refusal as an error and does not forward a call of the wrong shape or another tool', async () => {
    const { h, sent } = handler([{ ok: false, error: 'workspace_propose: there is no assignment ECN.304/x' }]);
    const refused = (await h.handle(call(8, VALID)))?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(refused).toEqual({ isError: true, content: [{ type: 'text', text: 'Not proposed: workspace_propose: there is no assignment ECN.304/x' }] });
    const shape = (await h.handle(call(9, { ...VALID, field: 'score' })))?.result as { isError: boolean };
    const other = (await h.handle(call(10, VALID, 'search_materials')))?.result as { isError: boolean };
    expect(shape.isError).toBe(true);
    expect(other.isError).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('files at most the limit, then refuses without asking the runner', async () => {
    const { h, sent } = handler([], 5);
    for (let i = 0; i < 5; i += 1) expect(((await h.handle(call(20 + i, { ...VALID, row_id: `r${i}` })))?.result as { isError: boolean }).isError).toBe(false);
    const sixth = (await h.handle(call(30, { ...VALID, row_id: 'r6' })))?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(sixth.isError).toBe(true);
    expect(sixth.content[0]?.text).toMatch(/filed its 5 proposals/);
    expect(sent).toHaveLength(5);
  });

  it('counts only the proposals actually filed toward the five (R2-5)', async () => {
    const refused: ProposeReply = { ok: false, error: 'workspace_propose: there is no assignment x' };
    const { h, sent } = handler([refused, refused, refused], 5);
    const results: boolean[] = [];
    for (let i = 0; i < 8; i += 1) results.push(((await h.handle(call(40 + i, { ...VALID, row_id: `r${i}` })))?.result as { isError: boolean }).isError);
    expect(results).toEqual([true, true, true, false, false, false, false, false]);
    const ninth = (await h.handle(call(48, { ...VALID, row_id: 'r9' })))?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(ninth.content[0]?.text).toMatch(/filed its 5 proposals/);
    expect(sent).toHaveLength(8);
  });

  it('takes at most ten calls in all in a turn, a call of the wrong shape included (R2-5)', async () => {
    expect(PROPOSE_CALLS_PER_TURN).toBe(10);
    const refused: ProposeReply = { ok: false, error: 'refused' };
    const { h, sent } = handler(Array.from({ length: 20 }, () => refused), 5);
    await h.handle(call(60, { ...VALID, field: 'score' }));
    for (let i = 0; i < 9; i += 1) await h.handle(call(61 + i, { ...VALID, row_id: `r${i}` }));
    const eleventh = (await h.handle(call(70, { ...VALID, row_id: 'last' })))?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(eleventh.isError).toBe(true);
    expect(eleventh.content[0]?.text).toMatch(/used its 10 calls/);
    expect(sent).toHaveLength(9);
  });
});

describe('the runner\'s socket', () => {
  const open: ProposeChannel[] = [];
  afterEach(async () => {
    for (const channel of open.splice(0)) await channel.close();
  });

  const testPath = (): string =>
    process.platform === 'win32'
      ? `\\\\.\\pipe\\w104-propose-${process.pid}-${Math.random().toString(16).slice(2)}`
      : path.join(os.tmpdir(), `w104-propose-${process.pid}-${Math.random().toString(16).slice(2)}.sock`);

  async function channel(propose: ProposeCall, extra: { logs?: string[]; fsCalls?: string[] } = {}) {
    const socketPath = testPath();
    const fsCalls = extra.fsCalls ?? [];
    const opened = await openProposeChannel({
      socketPath,
      requestId: '41',
      runner: 'workspace',
      propose,
      log: (line) => extra.logs?.push(line),
      fs: {
        rmSync: (file) => fsCalls.push(`rm ${file === socketPath ? 'socket' : file}`),
        chmodSync: (file, mode) => fsCalls.push(`chmod ${file === socketPath ? 'socket' : file} ${mode.toString(8)}`),
      },
    });
    open.push(opened);
    return { socketPath, opened };
  }

  it('is /run/workspace/propose-<request id>.sock, mode 0600, and never another path', () => {
    expect(proposeSocketPath('4812')).toBe('/run/workspace/propose-4812.sock');
    expect(PROPOSE_SOCKET_MODE).toBe(0o600);
    for (const id of ['../x', '0', '07', '', '4 1']) expect(() => proposeSocketPath(id)).toThrow(/request id/);
  });

  it('calls workspace_propose with the turn\'s own request id and runner name, and answers with the row', async () => {
    const calls: Array<[string, string, ProposeInput]> = [];
    const fsCalls: string[] = [];
    const { socketPath } = await channel(async (requestId, runner, input) => {
      calls.push([requestId, runner, input]);
      return ROW;
    }, { fsCalls });
    expect(fsCalls).toEqual(['rm socket', 'chmod socket 600']);
    expect(await sendProposal(socketPath, VALID)).toEqual({ ok: true, proposal: ROW });
    expect(calls).toEqual([['41', 'workspace', VALID]]);
  });

  it('checks the shape itself: a smuggled request id or runner never reaches the function', async () => {
    const calls: unknown[] = [];
    const { socketPath } = await channel(async (...args) => {
      calls.push(args);
      return ROW;
    });
    const smuggled = { ...VALID, runner: 'other', request_id: 1 } as unknown as ProposeInput;
    expect(await sendProposal(socketPath, smuggled)).toEqual({ ok: false, error: 'unknown field runner' });
    expect(calls).toHaveLength(0);
  });

  it('passes the function\'s own refusals back, and hides any other failure behind one sentence', async () => {
    const logs: string[] = [];
    const errors = [
      Object.assign(new Error('workspace_propose: the status of ECN.304/ps-4 already is that value'), { code: '22023' }),
      Object.assign(new Error('workspace_propose: request 41 already holds 5 proposals'), { code: '54000' }),
      Object.assign(new Error('permission denied for function workspace_propose'), { code: '42501' }),
      new Error('connection refused'),
    ];
    const { socketPath } = await channel(async () => {
      throw errors.shift();
    }, { logs });
    expect(await sendProposal(socketPath, VALID)).toEqual({ ok: false, error: 'workspace_propose: the status of ECN.304/ps-4 already is that value' });
    expect(await sendProposal(socketPath, VALID)).toEqual({ ok: false, error: 'workspace_propose: request 41 already holds 5 proposals' });
    expect(await sendProposal(socketPath, VALID)).toEqual({ ok: false, error: 'the proposal could not be filed; nothing was changed' });
    expect(await sendProposal(socketPath, VALID)).toEqual({ ok: false, error: 'the proposal could not be filed; nothing was changed' });
    expect(logs).toHaveLength(2);
    expect(logs.join('\n')).not.toContain('He said');
  });

  it('is gone once closed: the file removed, a call answered as unreachable', async () => {
    const fsCalls: string[] = [];
    const { socketPath, opened } = await channel(async () => ROW, { fsCalls });
    await opened.close();
    expect(fsCalls).toEqual(['rm socket', 'chmod socket 600', 'rm socket']);
    expect(await sendProposal(socketPath, VALID, 2000)).toEqual({ ok: false, error: 'the runner could not be reached' });
  });
});

describe('the built tool server, as the CLI starts it', () => {
  it('answers initialize and tools/list over stdio, and exits 2 without its socket', async () => {
    const run = (env: Record<string, string>, input: string) =>
      new Promise<{ code: number | null; stdout: string }>((resolve) => {
        const child = spawn(process.execPath, [BUILT_SERVER], { env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.on('close', (code) => resolve({ code, stdout }));
        child.stdin.end(input);
      });
    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ].map((line) => JSON.stringify(line)).join('\n');
    const ok = await run({ WORKSPACE_PROPOSE_SOCKET: '/run/workspace/propose-41.sock', WORKSPACE_PROPOSE_LIMIT: '5' }, `${lines}\n`);
    expect(ok.code).toBe(0);
    const answers = ok.stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result: { tools?: Array<{ name: string }> } });
    expect(answers.map((answer) => answer.id)).toEqual([1, 2]);
    expect(answers[1]?.result.tools?.map((tool) => tool.name)).toEqual(['propose_planner_change']);
    const missing = await run({}, `${lines}\n`);
    expect(missing.code).toBe(2);
    expect(missing.stdout).toBe('');
  });
});

/**
 * The planner tool server's MCP side (Phase 25b, E): JSON-RPC 2.0 over stdio, one message a line, as
 * the CLI speaks to a stdio server. Four methods are answered (`initialize`, `ping`, `tools/list`,
 * `tools/call`); notifications get no answer; anything else is "method not found". One tool,
 * `propose_planner_change`. A call whose input has the wrong shape is answered here and not
 * forwarded; a call past the turn's limit is refused here; every other call goes to the runner
 * (`send`), whose reply is the tool's result. The server holds no credential and makes no write.
 */

import {
  PLANNER_SERVER,
  PROPOSE_INPUT_SCHEMA,
  PROPOSE_TOOL,
  PROPOSE_TOOL_DESCRIPTION,
  readProposeInput,
  type ProposalRow,
  type ProposeInput,
  type ProposeReply,
} from './protocol.js';

export const SERVER_VERSION = '1.0.0';
/** Answered when the client names no version of its own. */
export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INVALID_REQUEST = -32600;

type Json = Record<string, unknown>;
type Id = string | number | null;

export interface PlannerHandlerDeps {
  /** Calls the runner may be sent this turn. */
  readonly limit: number;
  readonly send: (input: ProposeInput) => Promise<ProposeReply>;
}

export interface ToolResult {
  readonly content: ReadonlyArray<{ readonly type: 'text'; readonly text: string }>;
  readonly isError: boolean;
}

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const result = (id: Id, value: unknown): Json => ({ jsonrpc: '2.0', id, result: value });
const failure = (id: Id, code: number, message: string): Json => ({ jsonrpc: '2.0', id, error: { code, message } });
const toolText = (text: string, isError: boolean): ToolResult => ({ content: [{ type: 'text', text }], isError });

/** What the model reads after a proposal was filed: the row, and that nothing is changed yet. */
export function proposedText(row: ProposalRow): string {
  return [
    `Proposed (proposal ${row.proposal_id}) for "${row.label}". Nothing is changed yet: Stack approves or rejects it under this answer or in his Inbox.`,
    JSON.stringify(row),
  ].join('\n');
}

export interface PlannerHandler {
  /** The answer to one message, or null for a notification. */
  handle(message: unknown): Promise<Json | null>;
}

export function createPlannerHandler(deps: PlannerHandlerDeps): PlannerHandler {
  let sent = 0;

  async function call(params: Json): Promise<ToolResult> {
    if (params.name !== PROPOSE_TOOL) return toolText(`unknown tool ${String(params.name).slice(0, 80)}`, true);
    const read = readProposeInput(params.arguments);
    if (!read.ok) return toolText(`Not proposed: ${read.reason}.`, true);
    if (sent >= deps.limit) return toolText(`Not proposed: this answer has used its ${deps.limit} proposals.`, true);
    sent += 1;
    const reply = await deps.send(read.input);
    return reply.ok ? toolText(proposedText(reply.proposal), false) : toolText(`Not proposed: ${reply.error}`, true);
  }

  return {
    async handle(message) {
      if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        const id = isRecord(message) && (typeof message.id === 'string' || typeof message.id === 'number') ? message.id : null;
        return failure(id, INVALID_REQUEST, 'not a JSON-RPC 2.0 request');
      }
      if (!('id' in message)) return null;
      const id = (typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null) as Id;
      const params = isRecord(message.params) ? message.params : {};
      switch (message.method) {
        case 'initialize':
          return result(id, {
            protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: PLANNER_SERVER, version: SERVER_VERSION },
          });
        case 'ping':
          return result(id, {});
        case 'tools/list':
          return result(id, { tools: [{ name: PROPOSE_TOOL, description: PROPOSE_TOOL_DESCRIPTION, inputSchema: PROPOSE_INPUT_SCHEMA }] });
        case 'tools/call':
          if (!isRecord(message.params)) return failure(id, INVALID_PARAMS, 'tools/call needs params');
          return result(id, await call(params));
        default:
          return failure(id, METHOD_NOT_FOUND, `method not found: ${message.method.slice(0, 80)}`);
      }
    },
  };
}

/**
 * The tool gate's rules for an /inbox-apply run (Phase 23). Pure.
 *
 * The CLI runs the gate before every tool call, in the session and inside each agent it starts
 * (recorded on the pinned version: the hook input carries `agent_type` for an agent's call and
 * nothing for the session's own). Three callers, three sets:
 *
 *   the session        starts the two agents, reads SQL, searches the materials
 *   inbox-context      reads SQL, searches the materials
 *   inbox-writer       reads SQL and applies items (`apply_item`)
 *
 * So only the writer can reach the tool that writes, whatever a row or a file told the session to
 * do. Every SQL text, and every statement of an item, is also put through the guard here, before
 * the server sees it. The gate only
 * denies or stays silent, and anything it cannot read is a denial: it never fails open. The
 * An announcement run (Phase 26, the settings file started with `--run announcement`) has one
 * caller, the session, and no agents: it reads SQL, searches the materials and records decisions
 * (`record_review`). There, apply_item and every agent are denied; in an inbox run record_review
 * is denied. The kind comes from the hook command in the settings file the run was started with,
 * which the model cannot edit; a missing or unknown kind is the inbox run, the stricter set for
 * the new tool. The process around it and the answer's shape are Phase 21's (`workspace/src/hooks`).
 */

import type { GateDecision } from '../../../workspace/src/hooks/gate-rules.js';
import {
  AGENT_TOOL_NAMES,
  APPLY_TOOL,
  CONTEXT_AGENT,
  MATERIALS_TOOLS,
  QUERY_TOOL,
  RECORD_REVIEW_TOOL,
  WRITER_AGENT,
  type RunKind,
} from '../config.js';
import { checkQuery } from '../mcp-sql/guard.js';
import { readApplyItem, readRecordReview } from '../mcp-sql/rpc.js';

const SHOWN_MAX = 80;
const SESSION = '';
const AGENTS: readonly string[] = [CONTEXT_AGENT, WRITER_AGENT];

const deny = (reason: string): GateDecision => ({ allow: false, reason });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function queryDecision(input: unknown): GateDecision {
  const verdict = checkQuery(isRecord(input) ? input.sql : undefined);
  return verdict.ok ? { allow: true } : deny(`sql refused: ${verdict.reason}`);
}

function applyDecision(input: unknown): GateDecision {
  const read = readApplyItem(input);
  return 'reason' in read ? deny(`apply_item refused: ${read.reason}`) : { allow: true };
}

function reviewDecision(input: unknown): GateDecision {
  const read = readRecordReview(input);
  return 'reason' in read ? deny(`record_review refused: ${read.reason}`) : { allow: true };
}

/** The decision for one PreToolUse payload, as parsed from the hook's stdin. */
export function decide(payload: unknown, kind: RunKind = 'inbox'): GateDecision {
  if (!isRecord(payload)) return deny('tool gate: the hook input is not a JSON object');

  const toolName = payload.tool_name;
  if (typeof toolName !== 'string' || toolName === '') return deny('tool gate: the hook input names no tool');

  const agentRaw = payload.agent_type;
  if (agentRaw !== undefined && agentRaw !== null && typeof agentRaw !== 'string') return deny('tool gate: agent_type is not text');
  const agent = typeof agentRaw === 'string' ? agentRaw : SESSION;
  if (agent !== SESSION && !AGENTS.includes(agent)) return deny(`agent not allowed: ${agent.slice(0, SHOWN_MAX)}`);
  if (kind === 'announcement' && agent !== SESSION) return deny('an announcement run has no agents');

  if ((AGENT_TOOL_NAMES as readonly string[]).includes(toolName)) {
    if (kind === 'announcement') return deny('an announcement run starts no agents');
    if (agent !== SESSION) return deny('an agent cannot start another agent');
    const input = payload.tool_input;
    const wanted = isRecord(input) ? input.subagent_type : undefined;
    if (typeof wanted !== 'string' || !AGENTS.includes(wanted)) {
      return deny(`only the ${CONTEXT_AGENT} and ${WRITER_AGENT} agents can be started`);
    }
    return { allow: true };
  }

  if (toolName === QUERY_TOOL) return queryDecision(payload.tool_input);

  if (toolName === RECORD_REVIEW_TOOL) {
    if (kind !== 'announcement') return deny('record_review is for an announcement run only');
    return reviewDecision(payload.tool_input);
  }

  if (toolName === APPLY_TOOL) {
    if (kind === 'announcement') return deny('apply_item is for an inbox run only');
    if (agent !== WRITER_AGENT) return deny(`only the ${WRITER_AGENT} agent writes`);
    return applyDecision(payload.tool_input);
  }

  if ((MATERIALS_TOOLS as readonly string[]).includes(toolName)) return { allow: true };

  return deny(`tool not allowed: ${toolName.slice(0, SHOWN_MAX)}`);
}

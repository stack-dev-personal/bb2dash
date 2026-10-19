// Phase 26: the announcement reader's side of the apply worker. Pure and fake-port tests only: no
// process, no database, no network.

import { describe, expect, it, vi } from 'vitest';

import { buildAnnouncementArgs, buildArgs, checkInit } from '../src/claude.js';
import { CONTEXT_AGENT, PATHS, WRITER_AGENT } from '../src/config.js';
import { createAnnouncementRpc, parsePreparedAnnouncements, type AnnouncementRpc, type PreparedAnnouncements } from '../src/db.js';
import { decide } from '../src/hooks/gate-rules.js';
import { NO_DECISION_REASON, runAnnouncementPass } from '../src/announcement-pass.js';
import { runPass, type PassDeps } from '../src/loop.js';
import { callTool, readRecordReview, type SqlRunner } from '../src/mcp-sql/rpc.js';
import type { ApplyRpc } from '../src/db.js';
import type { ClaudeOutcome } from '../src/report.js';

const FINISHED: ClaudeOutcome = { exitCode: 0, timedOut: false, costUsd: 0.3, error: null, detail: null };
const decision = { outcome: 'nothing', summary: 'A study guide.', add: [], change: [], ask: [] };

describe('the announcement run arguments', () => {
  const args = buildAnnouncementArgs({ requestId: 77, announcementIds: [11, 12, 13], budgetUsd: 3 });

  it('is one sonnet session: no agents, the read tool, the one write tool and the materials tools', () => {
    expect(args.slice(0, 5)).toEqual(['-p', '--model', 'sonnet', '--tools', 'Agent']);
    expect(args).not.toContain('--agents');
    expect(args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--disallowedTools'))).toEqual([
      'mcp__db__query', 'mcp__db__record_review',
      'mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text', 'mcp__bb2dash__list_courses',
    ]);
    expect(args[args.indexOf('--settings') + 1]).toBe(PATHS.settingsAnnouncement);
    expect(args[args.indexOf('--max-budget-usd') + 1]).toBe('3.00');
    expect(args).not.toContain('--bare');
  });

  it('puts numbers only in the prompt, after --', () => {
    expect(args.slice(-2)).toEqual(['--', '/announcement-review 77 --unattended --announcements 11,12,13']);
  });

  it('refuses an empty batch, a bad id and a bad budget', () => {
    expect(() => buildAnnouncementArgs({ requestId: 1, announcementIds: [], budgetUsd: 3 })).toThrow(/at least one announcement/);
    expect(() => buildAnnouncementArgs({ requestId: 1, announcementIds: [1.5], budgetUsd: 3 })).toThrow(/announcement id/);
    expect(() => buildAnnouncementArgs({ requestId: 0, announcementIds: [1], budgetUsd: 3 })).toThrow(/request id/);
    expect(() => buildAnnouncementArgs({ requestId: 1, announcementIds: [1], budgetUsd: 0 })).toThrow(/budget/);
  });

  it('the inbox run still uses its own settings file', () => {
    const inbox = buildArgs({ requestId: 1, itemIds: [1], agents: {}, budgetUsd: 3 });
    expect(inbox[inbox.indexOf('--settings') + 1]).toBe(PATHS.settings);
  });
});

describe('the init line of an announcement run', () => {
  const init = (over: Record<string, unknown> = {}) => ({
    type: 'system', subtype: 'init', claude_code_version: '2.1.289', apiKeySource: 'none', permissionMode: 'dontAsk',
    mcp_servers: [{ name: 'db', status: 'connected' }, { name: 'bb2dash', status: 'connected' }],
    tools: ['Task', 'mcp__db__query', 'mcp__db__apply_item', 'mcp__db__record_review', 'mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text', 'mcp__bb2dash__list_courses'],
    agents: ['general-purpose'],
    skills: ['announcement-review', 'inbox-apply'],
    ...over,
  });

  it('passes with the skill and no agents of the inbox run', () => {
    expect(checkInit(init(), '2.1.289', 'announcement')).toEqual([]);
  });

  it('refuses a missing record_review tool, a missing skill and an inbox agent', () => {
    expect(checkInit(init({ tools: ['mcp__db__query'] }), '2.1.289', 'announcement').join('; ')).toMatch(/does not hold mcp__db__record_review/);
    expect(checkInit(init({ skills: ['inbox-apply'] }), '2.1.289', 'announcement').join('; ')).toMatch(/skills does not hold announcement-review/);
    expect(checkInit(init({ agents: [WRITER_AGENT] }), '2.1.289', 'announcement').join('; ')).toMatch(/agents holds inbox-writer/);
  });

  it('the inbox run still requires its agents and its skill', () => {
    const problems = checkInit(init({ skills: ['loop'] }), '2.1.289').join('; ');
    expect(problems).toMatch(/agents does not hold inbox-context/);
    expect(problems).toMatch(/skills does not hold inbox-apply/);
  });
});

describe('the announcement database calls', () => {
  function recorded(answers: Record<string, Record<string, unknown>[]>) {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const query = async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: answers[/public\.(\w+)\(/.exec(sql)?.[1] ?? 'other'] ?? [] };
    };
    return { rpc: createAnnouncementRpc(query), calls };
  }

  it('claim returns the request, or null', async () => {
    expect(await recorded({ announcement_review_claim: [{ id: '90' }] }).rpc.claim()).toEqual({ id: 90 });
    expect(await recorded({}).rpc.claim()).toBeNull();
    await expect(recorded({ announcement_review_claim: [{ id: 'x' }] }).rpc.claim()).rejects.toThrow(/expected a request id/);
  });

  it('prepare, skip and close send typed parameters', async () => {
    const { rpc, calls } = recorded({
      announcement_review_prepare: [{ prepared: { announcements: [{ id: 5, course_id: 'ECN.304' }], runs_today: 2 } }],
      announcement_review_close: [{ follow_up: '91' }],
    });
    expect(await rpc.prepare(90)).toEqual({ announcements: [{ id: 5, courseId: 'ECN.304' }], runsToday: 2 });
    await rpc.skip(90, 5, 'no decision recorded');
    expect(await rpc.close(90, 'done', { lines: [] })).toBe(91);
    expect(calls.map((c) => c.params)).toEqual([[90], [90, 5, 'no decision recorded'], [90, 'done', '{"lines":[]}']]);
    expect(await recorded({ announcement_review_close: [{ follow_up: null }] }).rpc.close(1, 'failed', {})).toBeNull();
  });

  it('refuses an answer that is not the prepared shape', () => {
    expect(() => parsePreparedAnnouncements(undefined)).toThrow(/no announcements list/);
    expect(() => parsePreparedAnnouncements({ announcements: [], runs_today: 'x' })).toThrow(/runs_today/);
    expect(() => parsePreparedAnnouncements({ announcements: [7], runs_today: 0 })).toThrow(/not an object/);
    expect(parsePreparedAnnouncements('{"announcements":[],"runs_today":0}')).toEqual({ announcements: [], runsToday: 0 });
  });
});

function announcementPorts(over: { prepares?: PreparedAnnouncements[]; claude?: ClaudeOutcome; claim?: number | null; skipFails?: boolean; maxRunsPerDay?: number } = {}) {
  const calls: string[] = [];
  const closes: { state: string; result: Record<string, unknown> }[] = [];
  const skips: [number, number, string][] = [];
  const runs: { requestId: number; announcementIds: readonly number[] }[] = [];
  const lines: string[] = [];
  const prepares = [...(over.prepares ?? [{ announcements: [{ id: 11, courseId: 'ECN.304' }, { id: 12, courseId: 'IST.323' }], runsToday: 0 }, { announcements: [], runsToday: 0 }])];
  const rpc: AnnouncementRpc = {
    claim: async () => { calls.push('claim'); return over.claim === null ? null : { id: over.claim ?? 77 }; },
    prepare: async () => { calls.push('prepare'); return prepares.shift() ?? { announcements: [], runsToday: 0 }; },
    skip: async (request, id, why) => {
      calls.push(`skip ${id}`);
      if (over.skipFails === true) throw new Error('refused');
      skips.push([request, id, why]);
    },
    close: async (_id, state, result) => { calls.push(`close ${state}`); closes.push({ state, result }); return null; },
  };
  const deps = {
    rpc,
    runClaude: async (input: { requestId: number; announcementIds: readonly number[] }) => { calls.push('claude'); runs.push(input); return over.claude ?? FINISHED; },
  };
  const ports = { log: (line: string) => lines.push(line), maxRunsPerDay: over.maxRunsPerDay };
  return { deps, ports, calls, closes, skips, runs, lines };
}

describe('one announcement pass', () => {
  it('nothing queued: one call, idle', async () => {
    const p = announcementPorts({ claim: null });
    expect(await runAnnouncementPass(p.deps, p.ports)).toBe('idle');
    expect(p.calls).toEqual(['claim']);
  });

  it('runs once on the ids prepared, and skips what the run left unreviewed', async () => {
    const p = announcementPorts({
      prepares: [
        { announcements: [{ id: 11, courseId: 'a' }, { id: 12, courseId: 'b' }], runsToday: 0 },
        { announcements: [{ id: 12, courseId: 'b' }, { id: 99, courseId: 'c' }], runsToday: 0 },
      ],
    });
    expect(await runAnnouncementPass(p.deps, p.ports)).toBe('done');
    expect(p.calls).toEqual(['claim', 'prepare', 'claude', 'prepare', 'skip 12', 'close done']);
    expect(p.runs).toEqual([{ requestId: 77, announcementIds: [11, 12] }]);
    // 99 was not in this run's batch: it is the follow-up's, not ours to refuse.
    expect(p.skips).toEqual([[77, 12, NO_DECISION_REASON]]);
    expect(p.closes[0]!.result).toMatchObject({ announcements: 2, skipped: [12], claude: { started: true, cost_usd: 0.3 }, error: null });
  });

  it('a request with nothing unreviewed closes done without starting Claude', async () => {
    const p = announcementPorts({ prepares: [{ announcements: [], runsToday: 0 }] });
    expect(await runAnnouncementPass(p.deps, p.ports)).toBe('done');
    expect(p.calls).toEqual(['claim', 'prepare', 'close done']);
  });

  it("the day's cap stops Claude and closes failed, so no follow-up is filed against it", async () => {
    const p = announcementPorts({ maxRunsPerDay: 3, prepares: [{ announcements: [{ id: 11, courseId: 'a' }], runsToday: 3 }] });
    expect(await runAnnouncementPass(p.deps, p.ports)).toBe('failed');
    expect(p.calls).toEqual(['claim', 'prepare', 'close failed']);
    expect(p.closes[0]!.result).toMatchObject({ error: 'daily_cap', claude: { started: false } });
  });

  it('a run cut short closes failed and refuses nothing', async () => {
    const p = announcementPorts({ claude: { exitCode: null, timedOut: true, costUsd: null, error: 'timed_out', detail: null } });
    expect(await runAnnouncementPass(p.deps, p.ports)).toBe('failed');
    expect(p.calls).toEqual(['claim', 'prepare', 'claude', 'close failed']);
    expect(p.closes[0]!.result).toMatchObject({ error: 'timed_out', skipped: [], claude: { started: true, timed_out: true } });
  });

  it('a skip that fails is logged, not counted, and does not stop the close', async () => {
    const p = announcementPorts({
      skipFails: true,
      prepares: [{ announcements: [{ id: 11, courseId: 'a' }], runsToday: 0 }, { announcements: [{ id: 11, courseId: 'a' }], runsToday: 0 }],
    });
    expect(await runAnnouncementPass(p.deps, p.ports)).toBe('done');
    expect(p.lines.some((l) => l.includes('announcement 11 could not be marked refused: refused'))).toBe(true);
    expect(p.closes[0]!.result).toMatchObject({ skipped: [] });
  });

  it('a throw after the claim closes the request failed, noting whether Claude started', async () => {
    const p = announcementPorts();
    const deps = { ...p.deps, runClaude: vi.fn(async () => { throw new Error('boom'); }) };
    expect(await runAnnouncementPass(deps, p.ports)).toBe('failed');
    expect(p.closes[0]).toMatchObject({ state: 'failed', result: { error: 'cli_error', claude: { started: true } } });
  });

  it('a close that also fails is logged and the pass still reads failed', async () => {
    const p = announcementPorts();
    const rpc: AnnouncementRpc = { ...p.deps.rpc, prepare: async () => { throw new Error('db gone'); }, close: async () => { throw new Error('db gone'); } };
    expect(await runAnnouncementPass({ ...p.deps, rpc }, p.ports)).toBe('failed');
    expect(p.lines.some((l) => l.includes('could not be closed'))).toBe(true);
  });
});

describe('the loop: inbox first, announcements when idle', () => {
  const inboxRpc = (claim: ApplyRpc['claim']): ApplyRpc => ({
    claim,
    prepare: async () => ({ queue: [], runsToday: 0, skip: [], trigger: 'sync' }),
    archive: async () => true,
    runFacts: async () => ({ archivedIds: [], changedIds: [], unarchivedWrites: [], flagged: [], leftIds: [] }),
    close: async () => null,
    ping: async () => {},
  });

  it('an idle inbox hands the pass to the announcement reader', async () => {
    const p = announcementPorts();
    const deps: PassDeps = { rpc: inboxRpc(async () => null), runClaude: async () => FINISHED, log: () => {}, announcements: p.deps };
    expect(await runPass(deps)).toBe('done');
    expect(p.calls[0]).toBe('claim');
  });

  it('a claimed inbox request never touches the announcement ports', async () => {
    const p = announcementPorts();
    const deps: PassDeps = { rpc: inboxRpc(async () => ({ id: 5 })), runClaude: async () => FINISHED, log: () => {}, announcements: p.deps };
    expect(await runPass(deps)).toBe('done');
    expect(p.calls).toEqual([]);
  });

  it('without announcement ports an idle inbox is idle', async () => {
    expect(await runPass({ rpc: inboxRpc(async () => null), runClaude: async () => FINISHED, log: () => {} })).toBe('idle');
  });
});

describe('the record_review tool', () => {
  const runner = (over: Partial<SqlRunner> = {}) => {
    const recorded: unknown[] = [];
    const r: SqlRunner = {
      query: async () => ({ command: 'SELECT', rowCount: 0, rows: [] }),
      applyItem: async () => ({ outcome: 'skipped' }),
      recordReview: async (input) => { recorded.push(input); return { added: [], raised: [] }; },
      ...over,
    };
    return { r, recorded };
  };
  const text = (result: Record<string, unknown> | null) => (result?.content as { text: string }[])[0]!.text;

  it('passes the request, the announcement and the decision to the runner, and reports it recorded', async () => {
    const { r, recorded } = runner();
    const result = await callTool('record_review', { request: 77, announcement_id: 11, decision }, r);
    expect(result?.isError).toBe(false);
    expect(recorded).toEqual([{ request: 77, announcement: 11, decision }]);
    expect(JSON.parse(text(result))).toMatchObject({ announcement: 11, outcome: 'recorded' });
  });

  it.each([
    ['no arguments', undefined, /not an object/],
    ['a zero request', { request: 0, announcement_id: 1, decision }, /request must be/],
    ['a text id', { request: 1, announcement_id: '5', decision }, /announcement_id must be/],
    ['a list decision', { request: 1, announcement_id: 5, decision: [] }, /decision must be/],
    ['a huge decision', { request: 1, announcement_id: 5, decision: { x: 'y'.repeat(31_000) } }, /longer than/],
  ])('refuses %s before the database', async (_label, args, reason) => {
    const { r, recorded } = runner();
    const result = await callTool('record_review', args, r);
    expect(result?.isError).toBe(true);
    expect(text(result)).toMatch(reason);
    expect(recorded).toEqual([]);
  });

  it("a database refusal is the tool's result, with its SQLSTATE, and says nothing was written", async () => {
    const { r } = runner({ recordReview: async () => { throw Object.assign(new Error('announcement_review_record: the quote is not in the post\nDETAIL x'), { code: '22023' }); } });
    const result = await callTool('record_review', { request: 1, announcement_id: 5, decision }, r);
    expect(result?.isError).toBe(true);
    expect(text(result)).toBe('error: announcement_review_record: the quote is not in the post (SQLSTATE 22023); nothing was written for this announcement');
  });

  it('readRecordReview names the first thing wrong', () => {
    expect('input' in readRecordReview({ request: 1, announcement_id: 2, decision })).toBe(true);
  });
});

describe('the tool gate by run kind', () => {
  const review = { tool_name: 'mcp__db__record_review', tool_input: { request: 77, announcement_id: 11, decision } };
  const apply = { tool_name: 'mcp__db__apply_item', agent_type: 'inbox-writer', tool_input: { request: 1, item: 2, statements: [], record: {} } };
  const verdict = (payload: unknown, kind?: 'inbox' | 'announcement') => {
    const d = decide(payload, kind);
    return d.allow ? true : d.reason;
  };

  it('record_review is allowed in an announcement run and nowhere else', () => {
    expect(verdict(review, 'announcement')).toBe(true);
    expect(verdict(review, 'inbox')).toMatch(/announcement run only/);
    expect(verdict(review)).toMatch(/announcement run only/);
    expect(verdict({ ...review, agent_type: WRITER_AGENT })).toMatch(/announcement run only/);
  });

  it('record_review is checked before the server sees it', () => {
    expect(verdict({ tool_name: review.tool_name, tool_input: { request: 1 } }, 'announcement')).toMatch(/record_review refused: announcement_id/);
  });

  it('apply_item is allowed to the writer in an inbox run and denied in an announcement run', () => {
    expect(verdict(apply, 'inbox')).toBe(true);
    expect(verdict(apply, 'announcement')).toMatch(/an announcement run has no agents/);
    expect(verdict({ ...apply, agent_type: undefined }, 'announcement')).toMatch(/inbox run only/);
  });

  it('an announcement run starts no agents, and still reads SQL and the materials', () => {
    expect(verdict({ tool_name: 'Agent', tool_input: { subagent_type: CONTEXT_AGENT } }, 'announcement')).toMatch(/starts no agents/);
    expect(verdict({ tool_name: 'mcp__db__query', tool_input: { sql: 'select id from announcements' } }, 'announcement')).toBe(true);
    expect(verdict({ tool_name: 'mcp__db__query', tool_input: { sql: 'delete from announcements' } }, 'announcement')).toMatch(/sql refused/);
    expect(verdict({ tool_name: 'mcp__bb2dash__search_materials', tool_input: {} }, 'announcement')).toBe(true);
    expect(verdict({ tool_name: 'Bash', tool_input: {} }, 'announcement')).toMatch(/tool not allowed/);
  });
});

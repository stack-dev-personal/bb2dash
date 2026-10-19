/**
 * bb2dash — the planner changes the assistant proposes: the reads and the one write (Phase 25b, E;
 * the frozen contract `119b_PHASE25B_contract.md`).
 *
 *   `v_workspace_proposals`          205: every column of 203, `effective_state`, the Inbox item
 *   `workspace_proposal_decide()`    206: SECURITY INVOKER, Stack's own row security; approve or reject
 *
 * Both places that decide (the card under an answer and the Inbox item) call `decideProposal` and
 * nothing else, and on success or on a 55000 refusal both caches are read again, the proposals and
 * the Inbox's, so a decision in one place shows in the other on its next read (Stack's answer 7).
 *
 * Conventions are `queries.workspace.ts`'s: a key in `proposalKeys`, an `xOptions()` returning
 * queryOptions, a `useX()` hook, throw on error. The objects are 203 to 206, which do not exist
 * before the phase's cut-over, so the client is the un-narrowed one and every row is normalised
 * (`workspace-proposals.ts`); `database.types.ts` carries their shapes by hand until it is
 * regenerated.
 */

import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { asRecord } from './json-record';
import { invalidateInboxCaches, untypedClient } from './queries.sync';
import { parseConversationId, toRequestId } from './queries.workspace';
import {
  PROPOSAL_COLUMNS,
  PROPOSAL_DECISIONS,
  PROPOSAL_STATES,
  isAlreadyDecided,
  normalizeProposals,
  type ProposalDecision,
  type ProposalState,
  type WorkspaceProposal,
} from './workspace-proposals';

const VIEW = 'v_workspace_proposals';
const DECIDE_FUNCTION = 'workspace_proposal_decide';

/** The cache-key slot used when there is no conversation; that query never runs. */
const NO_CONVERSATION = 'none';

/** Read whenever looked at: a decision can be made in the other place at any time. */
const ALWAYS_STALE_MS = 0;

export const proposalKeys = {
  /** Every proposals read sits under this prefix; a decision invalidates it whole. */
  all: () => ['workspace', 'proposals'] as const,
  conversation: (conversationId: string) => ['workspace', 'proposals', 'conversation', conversationId] as const,
  ids: (ids: readonly number[]) => ['workspace', 'proposals', 'ids', [...ids]] as const,
} as const;

/** Distinct positive ids, ascending: the order the page holds them in never changes a key. */
function sortedIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => toRequestId(id) === id))].sort((left, right) => left - right);
}

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------ */

/** A conversation's proposals, in id order. Matched to an answer by `request_id`. */
export function conversationProposalsOptions(conversationId: string | null) {
  const id = parseConversationId(conversationId);
  return queryOptions({
    queryKey: proposalKeys.conversation(id ?? NO_CONVERSATION),
    enabled: id !== null,
    staleTime: ALWAYS_STALE_MS,
    queryFn: async (): Promise<WorkspaceProposal[]> => {
      if (id === null) throw new Error('conversation id must be a uuid');
      const { data, error } = await untypedClient()
        .from(VIEW)
        .select(PROPOSAL_COLUMNS)
        .eq('conversation_id', id)
        .order('id', { ascending: true });
      if (error) throw error;
      return normalizeProposals(data);
    },
  });
}

/** The proposals the Inbox's `assistant_proposal` items stand for. */
export function proposalsByIdsOptions(ids: readonly number[]) {
  const wanted = sortedIds(ids);
  return queryOptions({
    queryKey: proposalKeys.ids(wanted),
    enabled: wanted.length > 0,
    staleTime: ALWAYS_STALE_MS,
    queryFn: async (): Promise<WorkspaceProposal[]> => {
      const { data, error } = await untypedClient()
        .from(VIEW)
        .select(PROPOSAL_COLUMNS)
        .in('id', wanted)
        .order('id', { ascending: true });
      if (error) throw error;
      return normalizeProposals(data);
    },
  });
}

export function useConversationProposals(conversationId: string | null) {
  return useQuery(conversationProposalsOptions(conversationId));
}

export function useProposalsByIds(ids: readonly number[]) {
  return useQuery(proposalsByIdsOptions(ids));
}

/* ---------------------------------------------------------------------------
 * The one write
 * ------------------------------------------------------------------------ */

export interface DecideInput {
  id: number;
  decision: ProposalDecision;
}

/** What 206 returns: the state the proposal now holds, and whether the planner was written. */
export interface DecideResult {
  state: ProposalState;
  applied: boolean;
}

function assertDecideInput(input: DecideInput): DecideInput {
  if (toRequestId(input.id) !== input.id) {
    throw new Error(`proposal id must be a positive integer, got ${String(input.id)}`);
  }
  if (!(PROPOSAL_DECISIONS as readonly string[]).includes(input.decision)) {
    throw new Error(`decision must be approve or reject, got ${String(input.decision)}`);
  }
  return input;
}

function decideResultOf(data: unknown): DecideResult {
  const row = asRecord(Array.isArray(data) ? data[0] : data);
  const state = row?.state;
  if (typeof state !== 'string' || !(PROPOSAL_STATES as readonly string[]).includes(state)) {
    throw new Error('the decision returned no outcome');
  }
  return { state: state as ProposalState, applied: row?.applied === true };
}

/** Approve or reject one proposal, as Stack, through 206 and nothing else. */
export async function decideProposal(input: DecideInput): Promise<DecideResult> {
  const { id, decision } = assertDecideInput(input);
  const { data, error } = await untypedClient().rpc(DECIDE_FUNCTION, { p_id: id, p_decision: decision });
  if (error) throw error;
  return decideResultOf(data);
}

/** The proposals, wherever they are read, and the Inbox's three caches. */
export function invalidateProposalCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: proposalKeys.all() });
  invalidateInboxCaches(queryClient);
}

/**
 * One card's decision. On success, and on a 55000 (the other place decided first), both places are
 * read again; any other failure leaves the caches alone and the card says why.
 */
export function useDecideProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: decideProposal,
    onSuccess: () => invalidateProposalCaches(queryClient),
    onError: (error) => {
      if (isAlreadyDecided(error)) invalidateProposalCaches(queryClient);
    },
  });
}

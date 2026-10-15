'use client';

/**
 * The lobby (Phase 24b, brief 111, "The lobby"; task 8, W-87): `/workspace`
 * with no conversation, in place of Phase 21's empty message column.
 *
 *   * a greeting with no name in it: the app holds no name of his (brief 111,
 *     "Why no name");
 *   * one composer, asking into a new conversation: an accepted question hands
 *     its id to `onCreated`, and a failure the composer does not word itself is
 *     said above it (`askProblemLine`) until the text changes;
 *   * his routines as shortcuts: a press sets the composer's routine chip by
 *     the path the composer's own routine list takes (`routine-request.ts`,
 *     default L-2) and sends nothing;
 *   * up to three example prompts from his upcoming work (`ExamplePrompts`);
 *   * the recent conversations, with "View all" (`LobbyRecent`);
 *   * the service line, as the thread has it.
 *
 * The root carries `data-lobby` (brief 111, "Data attributes, final"). Each
 * block reads its own rows, shows nothing while they are read or before
 * hydration, and says its own problem line when the read fails.
 */

import { useId, useState } from 'react';
import type { LobbyProps } from './composer-contract';
import { workspaceErrorReason } from '@/lib/queries.workspace';
import { useWorkspaceRoutines, type WorkspaceRoutine } from '@/lib/queries.workspace-routines';
import { useHydrated } from '@/lib/use-hydrated';
import { GREETING_LINE, ROUTINES_HEADING, askProblemLine, routinesProblemLine } from '@/lib/workspace-labels';
import { Composer } from './Composer';
import { ExamplePrompts } from './ExamplePrompts';
import { LobbyRecent } from './LobbyRecent';
import { RoutineRequestContext, useRoutineRequest } from './routine-request';
import { ServiceStatus } from './ServiceStatus';
import styles from './Lobby.module.css';

/** The lobby has no conversation, so no request to restore chips from. */
const NO_REQUESTS: readonly number[] = Object.freeze([]);

function RoutineButtons({ rows, onPress }: { rows: readonly WorkspaceRoutine[]; onPress: (id: string) => void }) {
  return (
    <div className={styles.shortcuts}>
      {rows.map((routine) => (
        <button
          key={routine.id}
          type="button"
          className={styles.shortcut}
          onClick={() => onPress(routine.id)}
        >
          {routine.title}
        </button>
      ))}
    </div>
  );
}

/** His routines as shortcuts; absent while read and when there is none. */
function RoutineShortcuts({ onPress }: { onPress: (id: string) => void }) {
  const hydrated = useHydrated();
  const routines = useWorkspaceRoutines();
  const headingId = useId();
  if (!hydrated) return null;
  if (routines.error) {
    return (
      <p className={styles.problem} role="alert">
        {routinesProblemLine(workspaceErrorReason(routines.error))}
      </p>
    );
  }
  if (routines.data === undefined || routines.data.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.heading}>
        {ROUTINES_HEADING}
      </h3>
      <RoutineButtons rows={routines.data} onPress={onPress} />
    </section>
  );
}

export function Lobby({ now, onCreated }: LobbyProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [exampleText, setExampleText] = useState<string | undefined>(undefined);
  const routine = useRoutineRequest();

  return (
    <section className={styles.lobby} data-lobby>
      <h2 className={styles.greeting}>{GREETING_LINE}</h2>
      {problem !== null && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <RoutineRequestContext.Provider value={routine.request}>
        <Composer
          conversationId={null}
          requestIds={NO_REQUESTS}
          requestOpen={false}
          busy={false}
          disabled={false}
          initialText={exampleText}
          onAsked={(result) => onCreated(result.conversationId)}
          onAskError={(error) => setProblem(askProblemLine(workspaceErrorReason(error)))}
          onStop={() => undefined}
          onEdit={() => setProblem(null)}
        />
      </RoutineRequestContext.Provider>
      <RoutineShortcuts onPress={routine.press} />
      <ExamplePrompts now={now} onPick={setExampleText} />
      <LobbyRecent now={now} />
      <ServiceStatus now={now} />
    </section>
  );
}

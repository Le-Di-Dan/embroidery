'use client';

/**
 * The moderation commands, and what the screen does with each outcome.
 *
 * One hook serves both `APP5-B05` mutations because their *lifecycle* is
 * identical — in flight, settled, refused — and only the body differs. The
 * shapes stay apart: the caller hands over a ready-built generated body and this
 * hook adds nothing to it.
 *
 * ### Nothing retries, and nothing double-fires
 *
 * `retry: false` covers the library. The `inFlight` ref covers the operator: a
 * `disabled` attribute is one render behind a fast double-click, so the second
 * click of a double-click reaches the handler with the button still enabled. The
 * ref is read and set synchronously in the same tick, which is the only guard
 * that is actually ahead of the event.
 *
 * ### A stale conflict re-reads and stops
 *
 * `APP5-B05` answers `409` when the request left the state the command was
 * judged against. The response is: zero automatic resubmit, re-read the detail,
 * show the operator what the request is now, and require a **new** explicit
 * decision. There is deliberately no "apply anyway" and no retained payload to
 * replay — `preservesEnteredFields` keeps the typed text only on the failures
 * where it still describes the state the request is in.
 *
 * ### Success is never assumed
 *
 * No optimistic status is written. The screen shows the move as done because the
 * refetched detail says it is done, and the success state is only entered after
 * that re-read resolves.
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import {
  classifyModerationFailure,
  preservesEnteredFields,
  requiresDetailReload,
  type ModerationFailure,
} from '../model/custom-request-detail-failure';
import { useDetailRefresh } from './use-detail-refresh';

export type ModerationOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failure'; readonly failure: ModerationFailure };

export interface ModerationMutationState<TBody> {
  readonly running: boolean;
  readonly outcome: ModerationOutcome;
  /** True exactly when the operator's typed text should stay on screen. */
  readonly keepEnteredFields: boolean;
  readonly run: (body: TBody) => void;
  readonly reset: () => void;
}

export interface UseModerationMutationInput<TBody> {
  readonly requestId: string;
  readonly send: (requestId: string, body: TBody) => Promise<void>;
}

export function useModerationMutation<TBody>({
  requestId,
  send,
}: UseModerationMutationInput<TBody>): ModerationMutationState<TBody> {
  const refreshDetail = useDetailRefresh(requestId);
  const [outcome, setOutcome] = useState<ModerationOutcome>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);

  const mutation = useMutation({
    retry: false,
    mutationFn: (body: TBody) => send(requestId, body),
  });

  // The command is still "running" while the detail is being re-read: the
  // outcome is not settled until the screen holds the persisted result, and
  // releasing the control before then would offer a second action against a
  // status the operator has not seen yet.
  const settle = useCallback((next: ModerationOutcome) => {
    inFlight.current = false;
    setRunning(false);
    setOutcome(next);
  }, []);

  const run = useCallback(
    (body: TBody) => {
      // Synchronous, so the second click of a double-click is dropped before it
      // can become a second write.
      if (inFlight.current) return;
      inFlight.current = true;
      setRunning(true);
      setOutcome({ kind: 'idle' });

      mutation.mutate(body, {
        onSuccess: () => {
          void refreshDetail().finally(() => {
            settle({ kind: 'success' });
          });
        },
        onError: (error: unknown) => {
          const failure = classifyModerationFailure(error);
          if (requiresDetailReload(failure)) {
            // The request is not in the state the operator decided against, so
            // the screen re-reads before saying anything — what they see next is
            // the canonical current state, and the decision starts over.
            void refreshDetail().finally(() => {
              settle({ kind: 'conflict' });
            });
            return;
          }
          settle({ kind: 'failure', failure });
        },
      });
    },
    [mutation, refreshDetail, settle],
  );

  return {
    running,
    outcome,
    keepEnteredFields:
      outcome.kind === 'failure'
        ? preservesEnteredFields(outcome.failure)
        : outcome.kind === 'idle',
    run,
    reset: useCallback(() => {
      setOutcome({ kind: 'idle' });
    }, []),
  };
}

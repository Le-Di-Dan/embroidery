'use client';

/**
 * Sending one exact version, and what the screen does with each outcome
 * (`APP6-A02` §18, §19).
 *
 * ### The version id is bound at activation, not at render
 *
 * `run` takes the version id the confirmation dialog was opened for, and that is
 * the id sent. Nothing re-derives a "current draft" between the operator's
 * confirmation and the request — which is the gap through which a screen sends a
 * version the operator did not look at.
 *
 * ### Nothing retries, and nothing double-fires
 *
 * `retry: false` covers the library; the `inFlight` ref covers the double-click,
 * which reaches the handler one render before `disabled` applies. A send is not
 * a read: `APP6-B09` answers a repeat send of the **same** version as a replay
 * rather than duplicating it, but the screen still must not issue it — a second
 * activation is what `GRD-004` would otherwise have to arbitrate.
 *
 * ### A replay is reported as a replay
 *
 * A repeat send returns the committed result having written nothing: no
 * re-freeze, no new hash, no second `design.review-ready` event and no second
 * notification. The screen says so rather than claiming a second send happened.
 *
 * ### `REVIEW_ALREADY_ACTIVE` is its own outcome
 *
 * It is **not** folded into `stale`, because the operator's next step differs.
 * The response is: no optimistic success, re-read the request and the whole
 * version tree, render the reconciliation state and require a new decision.
 * There is deliberately no path that supersedes the other review, none that
 * sends another version, none that selects "latest" and none that retries.
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import {
  classifySendFailure,
  requiresReconciliation,
  type SendFailure,
} from '../model/request-design-case-failure';
import { sendDesignVersion } from '../services/request-design-case.service';
import { useDesignCaseRefresh } from './use-design-case-refresh';

export type SendOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sent'; readonly versionId: string; readonly replayed: boolean }
  | { readonly kind: 'failure'; readonly failure: SendFailure };

export interface SendState {
  readonly running: boolean;
  readonly outcome: SendOutcome;
  readonly run: (versionId: string) => void;
  readonly reset: () => void;
}

interface UseSendDesignVersionInput {
  readonly requestId: string;
  /** Points the screen at the version the server just settled. */
  readonly onVersionSettled: (versionId: string) => void;
}

export function useSendDesignVersion({
  requestId,
  onVersionSettled,
}: UseSendDesignVersionInput): SendState {
  const { refreshAll } = useDesignCaseRefresh(requestId);
  const [outcome, setOutcome] = useState<SendOutcome>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);

  const mutation = useMutation({
    retry: false,
    mutationFn: (versionId: string) => sendDesignVersion({ requestId, versionId }),
  });

  const settle = useCallback((next: SendOutcome) => {
    inFlight.current = false;
    setRunning(false);
    setOutcome(next);
  }, []);

  const run = useCallback(
    (versionId: string) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setRunning(true);
      setOutcome({ kind: 'idle' });

      mutation.mutate(versionId, {
        onSuccess: (result) => {
          void (async () => {
            // The request may have moved too — B09 projects `DIGITIZING →
            // DESIGN_REVIEW` inside the send transaction — so the context is
            // re-read alongside the history. The screen never synthesizes that
            // status and never claims to have set it.
            await refreshAll();
            // The server's own version id, not the one the dialog held. They
            // agree — the send is bound to the exact path version — and reading
            // the server's copy is what keeps that an assertion rather than an
            // assumption.
            onVersionSettled(result.versionId);
            settle({ kind: 'sent', versionId: result.versionId, replayed: result.replayed });
          })();
        },
        onError: (error: unknown) => {
          const failure = classifySendFailure(error);
          if (!requiresReconciliation(failure)) {
            settle({ kind: 'failure', failure });
            return;
          }
          void (async () => {
            await refreshAll();
            settle({ kind: 'failure', failure });
          })();
        },
      });
    },
    [mutation, onVersionSettled, refreshAll, settle],
  );

  const reset = useCallback(() => {
    if (inFlight.current) {
      return;
    }
    setOutcome({ kind: 'idle' });
  }, []);

  return { running, outcome, run, reset };
}

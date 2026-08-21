'use client';

/**
 * Sending one exact version, and what the screen does with each outcome
 * (`APP6-A01` §15).
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
 * a read: a second one is refused as a replay rather than duplicated, but the
 * screen still must not issue it.
 *
 * ### A replay is reported as a replay
 *
 * `APP6-B03` answers a repeat send with the committed result and
 * `replayed: true`, having written nothing — no re-freeze, no new validity
 * window, no pointer move, no second notification. The screen says so rather
 * than claiming a second send happened.
 *
 * ### A stale refusal re-reads and stops
 *
 * The version or the request is no longer sendable. The response is: zero
 * automatic resend, re-read the context and the history, render what is now
 * true, and require a **new** explicit operator action. There is deliberately no
 * "send anyway", and no path that picks a different version to send instead.
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import {
  classifySendFailure,
  requiresReconciliation,
  type SendFailure,
} from '../model/request-quotation-failure';
import { sendQuotationVersion } from '../services/request-quotation.service';
import { useQuotationRefresh } from './use-quotation-refresh';

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

interface UseQuotationSendInput {
  readonly requestId: string;
  readonly quotationId: string;
  /** Points the screen at the version the server just settled. */
  readonly onVersionSettled: (versionId: string) => void;
}

export function useQuotationSend({
  requestId,
  quotationId,
  onVersionSettled,
}: UseQuotationSendInput): SendState {
  const { refreshAll } = useQuotationRefresh(requestId);
  const [outcome, setOutcome] = useState<SendOutcome>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);

  const mutation = useMutation({
    retry: false,
    mutationFn: (versionId: string) => sendQuotationVersion(quotationId, versionId),
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
            // The request moved too — B03 may have projected it to QUOTED — so
            // the context is re-read alongside the history. The screen never
            // synthesizes that status.
            await refreshAll(quotationId);
            onVersionSettled(result.version.versionId);
            settle({
              kind: 'sent',
              versionId: result.version.versionId,
              replayed: result.replayed,
            });
          })();
        },
        onError: (error: unknown) => {
          const failure = classifySendFailure(error);
          if (!requiresReconciliation(failure)) {
            settle({ kind: 'failure', failure });
            return;
          }
          void (async () => {
            await refreshAll(quotationId);
            settle({ kind: 'failure', failure });
          })();
        },
      });
    },
    [mutation, onVersionSettled, quotationId, refreshAll, settle],
  );

  const reset = useCallback(() => {
    if (inFlight.current) {
      return;
    }
    setOutcome({ kind: 'idle' });
  }, []);

  return { running, outcome, run, reset };
}

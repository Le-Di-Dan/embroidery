'use client';

/**
 * The two payment decisions, and what the screen does with every way they can
 * end (`740:3`, `740:56`, `741:51`, `741:87`).
 *
 * One hook serves both mutations because their *lifecycle* is identical — in
 * flight, settled, reconciled, refused — and only the body differs. The shapes
 * stay apart: the caller hands over a ready-built generated body and this hook
 * adds nothing to it.
 *
 * ## Nothing retries, and nothing double-fires
 *
 * `retry: false` covers the library. The `inFlight` ref covers the operator: a
 * `disabled` attribute is one render behind a fast double-click, so the second
 * click of a double-click reaches the handler with the button still enabled. The
 * ref is read and set synchronously in the same tick, which is the only guard
 * actually ahead of the event. It is UX protection and nothing more — the server
 * is the financial concurrency authority, and no client lock is relied on for
 * correctness.
 *
 * ## A lost response is never reported as a failure
 *
 * This is `741:51`, and it is the reason this hook exists rather than a plain
 * `useMutation`. When the transport fails with no status line, the server may
 * have committed the write and lost the response on the way back; the client
 * cannot tell. So the screen says "đang kiểm tra lại trạng thái giao dịch…",
 * keeps the submit control locked, re-reads `adminOrderPayment_read`, and reads
 * the answer out of the **current truth**:
 *
 * - the attempt is `SUCCEEDED` with the deposit `SATISFIED` and the order
 *   `DEPOSIT_PAID` → the earlier call landed; show the approved success;
 * - the attempt is `REQUIRES_REVIEW` → it landed as a mismatch; show that;
 * - nothing moved → say so and let the operator send the *same values* again.
 *   `APP7-B04` converges on a replay, so a genuine duplicate writes nothing
 *   twice; different values are not a replay and are answered `409`.
 *
 * There is no automatic resubmit anywhere on this path. A financial mutation is
 * never retried in a loop.
 *
 * Every 5xx is treated the same way, for the same reason: the platform replaces
 * a 5xx code and message with a generic pair, so nothing distinguishes "refused"
 * from "committed then failed to answer".
 *
 * ## A conflict reconciles rather than insists
 *
 * `741:87`: two operators can open the same attempt, the first writer wins, and
 * the loser's screen must reconcile to the current truth instead of treating
 * itself as right. A `409` reloads the payment truth and the order, reports that
 * someone else acted first, and requires a **new** decision on the reloaded
 * data. There is deliberately no "apply anyway" and no retained payload to
 * replay, and no lock, transaction, version or contention language reaches the
 * operator (`741:121`).
 *
 * ## Success is never assumed
 *
 * No optimistic status is written. The panel shows the move as done because the
 * refetched payment truth says it is done, and the settled state is only entered
 * after that re-read resolves.
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { AdminOrderPaymentsResponse, PaymentDecisionResponse } from '@embroidery/api-client';

import {
  classifyPaymentDecisionFailure,
  preservesEnteredFields,
  type PaymentDecisionFailure,
} from '../model/order-detail-failure';
import {
  isAttemptAwaitingReview,
  isPaymentSettledFor,
  readPaymentDecision,
  type PaymentDecisionOutcome,
} from '../model/payment-decision-outcome';
import { useOrderRefresh } from './use-order-detail-queries';

export type PaymentDecisionPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  /** Re-reading the current truth after a lost response or a conflict. */
  | { readonly kind: 'reconciling'; readonly reason: 'ambiguous' | 'stale' }
  /**
   * The server's answer, whether it arrived as a receipt or was recovered from
   * the refetched truth. `reconciled` says which — the panel tells the operator
   * when the outcome was recovered rather than reported.
   */
  | {
      readonly kind: 'settled';
      readonly outcome: PaymentDecisionOutcome;
      readonly reconciled: boolean;
    }
  /** The lost response left the attempt exactly where it was. */
  | { readonly kind: 'unchanged' }
  /** Another operator wrote first; the reloaded truth is on screen. */
  | { readonly kind: 'stale' }
  | { readonly kind: 'failed'; readonly failure: PaymentDecisionFailure };

export interface PaymentDecisionState<TBody> {
  readonly phase: PaymentDecisionPhase;
  /** True while the operator must not be able to submit again. */
  readonly busy: boolean;
  /** True exactly when the operator's typed text should stay on screen. */
  readonly keepEnteredFields: boolean;
  readonly run: (body: TBody) => void;
  readonly reset: () => void;
}

export interface UsePaymentDecisionInput<TBody> {
  readonly orderId: string;
  /** The attempt both the mutation and the recovery read are addressed by. */
  readonly attemptId: string;
  readonly send: (attemptId: string, body: TBody) => Promise<PaymentDecisionResponse>;
}

/** Rebuilds an outcome from refetched truth, for the recovered-success path. */
function outcomeFromPayments(
  payments: AdminOrderPaymentsResponse,
  attemptId: string,
): PaymentDecisionOutcome | null {
  const attempt = payments.attempts.find((candidate) => candidate.attemptId === attemptId);
  if (attempt === undefined) return null;
  const base = {
    attemptStatus: attempt.status,
    depositStatus: payments.currentObligation?.status ?? '',
    orderStatus: payments.orderStatus,
    // The write this describes happened on an earlier call whose response was
    // lost. Nothing was written twice, but this is not the contract's `replayed`
    // flag either — no second request was made.
    replayed: false,
  };
  if (isPaymentSettledFor(payments, attemptId)) {
    return { kind: 'verified', ...base };
  }
  if (isAttemptAwaitingReview(payments, attemptId)) {
    return { kind: 'requiresReview', ...base };
  }
  return null;
}

export function usePaymentDecision<TBody>({
  orderId,
  attemptId,
  send,
}: UsePaymentDecisionInput<TBody>): PaymentDecisionState<TBody> {
  const { refreshAll, refreshPayments } = useOrderRefresh(orderId);
  const [phase, setPhase] = useState<PaymentDecisionPhase>({ kind: 'idle' });
  const inFlight = useRef(false);

  const mutation = useMutation({
    retry: false,
    mutationFn: (body: TBody) => send(attemptId, body),
  });

  const settle = useCallback((next: PaymentDecisionPhase) => {
    inFlight.current = false;
    setPhase(next);
  }, []);

  const recoverFromAmbiguity = useCallback(async () => {
    setPhase({ kind: 'reconciling', reason: 'ambiguous' });
    const payments = await refreshPayments();
    const recovered = payments === undefined ? null : outcomeFromPayments(payments, attemptId);
    if (recovered === null) {
      // Nothing moved. The earlier call may never have reached the server, so
      // the operator is offered an explicit re-send of the same values — never
      // an automatic one.
      settle({ kind: 'unchanged' });
      return;
    }
    // Something did commit, so the order and the queue may have moved with it.
    await refreshAll();
    settle({ kind: 'settled', outcome: recovered, reconciled: true });
  }, [attemptId, refreshAll, refreshPayments, settle]);

  const run = useCallback(
    (body: TBody) => {
      // Synchronous, so the second click of a double-click is dropped before it
      // can become a second write.
      if (inFlight.current) return;
      inFlight.current = true;
      setPhase({ kind: 'running' });

      mutation.mutate(body, {
        onSuccess: (decision: PaymentDecisionResponse) => {
          const outcome = readPaymentDecision(decision);
          void refreshAll().finally(() => {
            settle({ kind: 'settled', outcome, reconciled: false });
          });
        },
        onError: (error: unknown) => {
          const failure = classifyPaymentDecisionFailure(error);
          if (failure === 'ambiguous') {
            void recoverFromAmbiguity();
            return;
          }
          if (failure === 'stale') {
            setPhase({ kind: 'reconciling', reason: 'stale' });
            void refreshAll().finally(() => {
              settle({ kind: 'stale' });
            });
            return;
          }
          if (failure === 'missing') {
            // The attempt is not where the screen thought it was. Reload before
            // saying anything, so what the operator sees next is canonical.
            void refreshAll().finally(() => {
              settle({ kind: 'failed', failure });
            });
            return;
          }
          settle({ kind: 'failed', failure });
        },
      });
    },
    [mutation, recoverFromAmbiguity, refreshAll, settle],
  );

  return {
    phase,
    busy: phase.kind === 'running' || phase.kind === 'reconciling',
    keepEnteredFields:
      phase.kind === 'failed'
        ? preservesEnteredFields(phase.failure)
        : phase.kind === 'idle' || phase.kind === 'unchanged',
    run,
    reset: useCallback(() => {
      setPhase({ kind: 'idle' });
    }, []),
  };
}

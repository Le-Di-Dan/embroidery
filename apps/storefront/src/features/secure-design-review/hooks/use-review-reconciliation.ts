'use client';

/**
 * The single re-read, from the moment it is asked for to the moment its verdict
 * is known (`APP6-S02` §13, §14, §15, §16, §19).
 *
 * Three responsibilities that belong together and nowhere else:
 *
 * 1. **at most one is ever in flight.** A request is held in a ref, not in
 *    state, so a second refusal arriving mid-read cannot queue a second read
 *    behind the first. There is one read, one payload, and one answer to "what
 *    is current" — a second read path would be a second answer.
 * 2. **it waits for the screen to say so.** The read is not issued until the
 *    stage is actually showing the reconciling frame, so the customer never
 *    sees a decision silently re-read behind a confirmation they are still
 *    looking at.
 * 3. **completion is a counter, not a flag.** `resolveCount` can only go up,
 *    and goes up exactly once per completed read. A pending flag reads false
 *    both before a request starts and after it ends, and a fast response can be
 *    batched so its `true` is never rendered at all — the failure being a
 *    reconciliation that never settles, leaving the screen stuck on a frame
 *    nothing will resolve.
 *
 * What the answer *means* is `reconcileVerdict`'s to say. This hook decides
 * when to ask and when the asking is over; it applies no rule about versions,
 * hashes or terms.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';

import type { CustomerDesignReviewResponse } from '@embroidery/api-client';

import type { SecureLinkBootstrap } from '../../secure-link-access';
import type { DecisionNotice, ApprovalIntent, ReviewStageKind } from '../model/design-review-state';
import {
  reconcileVerdict,
  type ReconcileReason,
  type ReconcileVerdict,
} from '../model/design-review-reconciliation';

interface ReconcileRequest {
  readonly reason: ReconcileReason;
  /** Carried so a refusal's notice survives the read that precedes it. */
  readonly notice: DecisionNotice | undefined;
  phase: 'REQUESTED' | 'IN_FLIGHT';
  /** The bootstrap's success count when this read was issued. */
  baseline: number;
}

export interface ReviewReconciliationOptions {
  readonly bootstrap: SecureLinkBootstrap<CustomerDesignReviewResponse>;
  readonly stageKind: ReviewStageKind;
  /** The captured approval, read at settlement so the compare is against it. */
  readonly intentRef: RefObject<ApprovalIntent | undefined>;
  /** The credential is gone, so the grant is treated as ended. */
  readonly onCredentialLost: () => void;
  /** The re-read itself failed; the access state already reports why. */
  readonly onReadFailed: () => void;
  readonly onSettled: (verdict: ReconcileVerdict, notice: DecisionNotice | undefined) => void;
}

export interface ReviewReconciliation {
  /** Requests the one re-read. A second call while one is pending is ignored. */
  readonly start: (reason: ReconcileReason, notice: DecisionNotice | undefined) => void;
  /** Whether a reconciliation is currently pending. */
  readonly isPending: () => boolean;
  /** Drops a pending reconciliation outright, without settling it. */
  readonly cancel: () => void;
}

export function useReviewReconciliation({
  bootstrap,
  stageKind,
  intentRef,
  onCredentialLost,
  onReadFailed,
  onSettled,
}: ReviewReconciliationOptions): ReviewReconciliation {
  const pendingRef = useRef<ReconcileRequest | undefined>(undefined);

  // Held in refs so the effect below needs no dependency list it could not
  // honestly write: `bootstrap` is a fresh object every render, so any list
  // would be a list of everything.
  const lostRef = useRef(onCredentialLost);
  lostRef.current = onCredentialLost;
  const failedRef = useRef(onReadFailed);
  failedRef.current = onReadFailed;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const start = useCallback((reason: ReconcileReason, notice: DecisionNotice | undefined) => {
    if (pendingRef.current !== undefined) return;
    pendingRef.current = { reason, notice, phase: 'REQUESTED', baseline: 0 };
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current = undefined;
  }, []);

  const isPending = useCallback(() => pendingRef.current !== undefined, []);

  useEffect(() => {
    const pending = pendingRef.current;
    if (pending === undefined) return;

    if (pending.phase === 'REQUESTED') {
      if (stageKind !== 'RECONCILING') return;
      if (!bootstrap.hasCredential()) {
        lostRef.current();
        return;
      }
      pending.phase = 'IN_FLIGHT';
      pending.baseline = bootstrap.resolveCount;
      bootstrap.retry();
      return;
    }

    const settled =
      bootstrap.resolveCount !== pending.baseline || bootstrap.state.status !== 'AUTHORIZED';
    if (!settled) return;
    pendingRef.current = undefined;

    if (bootstrap.state.status !== 'AUTHORIZED') {
      failedRef.current();
      return;
    }

    settledRef.current(
      reconcileVerdict(pending.reason, intentRef.current, bootstrap.state.payload),
      pending.notice,
    );
  });

  return { start, isPending, cancel };
}

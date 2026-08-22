'use client';

/**
 * The `/truy-cap/bao-gia` controller (`APP6-S01` §6, §9, §11, §12, §19).
 *
 * It composes three things and owns the rules that connect them:
 *
 * - `useSecureLinkBootstrap`, which performs the locked capture → strip → body
 *   sequence and then **keeps** the credential, because unlike every earlier
 *   secure landing this one spends it a second time on the customer's own
 *   decision;
 * - `quoteStageReducer`, which is what the customer is doing;
 * - the two decision calls, each of which names one exact version.
 *
 * ### The credential never becomes a value
 *
 * Both mutations are declared with **no variables**, so TanStack's retained
 * `mutation.variables` is permanently `undefined`. The secret is reached only
 * through `runWithSecret`, which hands it to the request function on the stack
 * and never returns it. Nothing in this file assigns it to a variable, a state
 * field, a ref of its own or a log line. It is destroyed the moment a decision
 * commits, the moment the session ends, and on unmount.
 *
 * ### One request per activation, decided synchronously
 *
 * `inFlightRef` is a plain boolean flipped *before* `mutate()`, not a derived
 * `isPending`. Two activations in the same tick both observe the pre-render
 * value of `isPending`, so a check on that would let both through; a ref written
 * synchronously is the only guard that closes the same-tick window (§19).
 *
 * ### The single re-read
 *
 * There is exactly one way this screen re-reads the quotation — the bootstrap's
 * own `retry()` — and {@link ReconcileRequest} records why the current one was
 * issued. That matters because the same re-read serves three different
 * follow-ups: after a step-up it decides *same version or new*, after a stale
 * refusal it always lands on `702:65`, and after a transition or idempotency
 * refusal it restores the quotation with a notice. One read, one payload, one
 * answer to "what is current" — a second read path would be a second answer
 * (§11).
 *
 * Completion is detected by the bootstrap's success counter, not by a pending
 * flag. A flag reads false both before the request starts and after it finishes,
 * and a fast response can be batched so that its `true` is never rendered at
 * all; the counter can only go up, and it goes up exactly once per completed
 * read.
 *
 * Nothing here polls, and nothing here retries automatically (§12, §19).
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { normalizeApiClientError, type CustomerQuotationResponse } from '@embroidery/api-client';
import { useMutation } from '@tanstack/react-query';

import { useSecureLinkBootstrap, type SecureLinkState } from '../../secure-link-access';
import {
  acceptQuotation,
  readCurrentQuotation,
  rejectQuotation,
} from '../api/secure-quotation.client';
import {
  decisionFailureOf,
  endsSecureSession,
  requiresReconciliationRead,
  type DecisionFailure,
} from '../model/secure-quotation-failure';
import {
  initialQuoteStage,
  quoteStageReducer,
  secureQuotationUiState,
  type DecisionNotice,
  type QuoteStage,
  type QuoteUiState,
} from '../model/secure-quotation-state';

/** Why the one in-flight re-read was issued. */
type ReconcileReason = 'STEP_UP' | 'STALE' | 'NOTICE';

interface ReconcileRequest {
  readonly reason: ReconcileReason;
  /** Carried so a refusal's notice survives the read that precedes it. */
  readonly notice: DecisionNotice | undefined;
  phase: 'REQUESTED' | 'IN_FLIGHT';
  /** The bootstrap's success count when this read was issued. */
  baseline: number;
}

/** The one state the shell is given, and everything the screen needs beneath it. */
export interface SecureQuotation {
  readonly linkState: SecureLinkState<CustomerQuotationResponse>;
  readonly retryLink: () => void;
  readonly retryingLink: boolean;
  readonly stage: QuoteStage;
  /** Which approved frame is on screen, once the link is authorized. */
  readonly uiStateOf: (quote: CustomerQuotationResponse) => QuoteUiState;
  readonly requestAccept: (versionId: string) => void;
  readonly requestReject: (versionId: string) => void;
  readonly dismissDecision: () => void;
  readonly confirmAccept: () => void;
  readonly confirmReject: () => void;
  readonly stepUpVerified: () => void;
  readonly reviewStale: () => void;
}

export function useSecureQuotation(): SecureQuotation {
  const bootstrap = useSecureLinkBootstrap<CustomerQuotationResponse>(
    (secret) => readCurrentQuotation(secret),
    { retainCredentialAfterSuccess: true },
  );
  const [stage, dispatch] = useReducer(quoteStageReducer, initialQuoteStage);

  /**
   * The version the in-flight decision names.
   *
   * Mirrored out of the reducer because a mutation function declared with no
   * variables closes over whatever it captured at declaration; the ref is the
   * only value it reads, and it is written by the same handler that dispatches
   * the stage move, so the two can never name different versions.
   */
  const decisionVersionRef = useRef('');
  const inFlightRef = useRef(false);
  const reconcileRef = useRef<ReconcileRequest | undefined>(undefined);

  /**
   * Set when a decision answers with a refusal that ends the grant.
   *
   * The bootstrap's own state cannot express this — its read succeeded — so the
   * screen substitutes the identical unavailable state rather than inventing a
   * fourth access frame. Indistinguishable from a link that never opened, which
   * is the point (§18).
   */
  const sessionEndedRef = useRef(false);
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  const endSession = useCallback(() => {
    sessionEndedRef.current = true;
    reconcileRef.current = undefined;
    bootstrap.clearCredential();
    forceRender();
  }, [bootstrap]);

  const settleFailure = useCallback(
    (error: unknown) => {
      const failure: DecisionFailure = decisionFailureOf(normalizeApiClientError(error));
      if (endsSecureSession(failure)) {
        endSession();
        return;
      }
      if (failure === 'REVERIFICATION_REQUIRED') {
        // Evidence is missing, not consent. The decision is suspended inside
        // this same mounted session — never by navigating away (§8).
        dispatch({ type: 'STEP_UP_REQUIRED' });
        return;
      }
      if (failure === 'QUOTE_VERSION_STALE') {
        reconcileRef.current = {
          reason: 'STALE',
          notice: undefined,
          phase: 'REQUESTED',
          baseline: 0,
        };
        dispatch({ type: 'RECONCILE_STARTED' });
        return;
      }
      if (requiresReconciliationRead(failure)) {
        reconcileRef.current = {
          reason: 'NOTICE',
          notice: failure,
          phase: 'REQUESTED',
          baseline: 0,
        };
        dispatch({ type: 'RECONCILE_STARTED' });
        return;
      }
      dispatch({ type: 'DECISION_REFUSED', notice: failure });
    },
    [endSession],
  );

  const accept = useMutation({
    mutationFn: () =>
      bootstrap.runWithSecret((secret) => acceptQuotation(secret, decisionVersionRef.current)),
    onSuccess: (outcome) => {
      // Committed. The credential has no further use on this screen, so it is
      // destroyed even though the grant itself may still be live.
      bootstrap.clearCredential();
      dispatch({ type: 'ACCEPT_COMMITTED', outcome });
    },
    onError: settleFailure,
    onSettled: () => {
      inFlightRef.current = false;
      accept.reset();
    },
    retry: false,
  });

  const reject = useMutation({
    mutationFn: () =>
      bootstrap.runWithSecret((secret) => rejectQuotation(secret, decisionVersionRef.current)),
    onSuccess: (outcome) => {
      bootstrap.clearCredential();
      dispatch({ type: 'REJECT_COMMITTED', outcome });
    },
    onError: settleFailure,
    onSettled: () => {
      inFlightRef.current = false;
      reject.reset();
    },
    retry: false,
  });

  /**
   * Issues the one re-read, then reads its verdict.
   *
   * Deliberately without a dependency array: `bootstrap` is a fresh object each
   * render, so any list would be a list of everything. `reconcileRef` is the
   * real guard, and it makes every render in which no reconciliation is pending
   * a no-op.
   */
  useEffect(() => {
    const pending = reconcileRef.current;
    if (pending === undefined) return;

    if (pending.phase === 'REQUESTED') {
      // Wait for the stage to actually be showing the reconciling frame, so the
      // customer never sees a decision silently re-read behind a confirmation.
      if (stage.kind !== 'RECONCILING') return;
      if (!bootstrap.hasCredential()) {
        endSession();
        return;
      }
      pending.phase = 'IN_FLIGHT';
      pending.baseline = bootstrap.resolveCount;
      bootstrap.retry();
      return;
    }

    // Settled when the read either succeeded — the counter moved — or failed,
    // which the access state reports for itself.
    const settled =
      bootstrap.resolveCount !== pending.baseline || bootstrap.state.status !== 'AUTHORIZED';
    if (!settled) return;
    reconcileRef.current = undefined;

    if (bootstrap.state.status !== 'AUTHORIZED') {
      // The re-read itself failed. The access state the shell renders already
      // says so; this only releases the stage so a later success is not stuck
      // behind a reconciling frame nothing will ever resolve.
      dispatch({ type: 'DECISION_REFUSED', notice: 'TRANSIENT' });
      return;
    }

    if (pending.reason === 'STEP_UP') {
      // A completed step-up is evidence, never acceptance. The same version
      // returns the customer to the confirmation, where they must choose to
      // accept a second time, explicitly (§9).
      dispatch(
        bootstrap.state.payload.versionId === decisionVersionRef.current
          ? { type: 'RECONCILED_SAME_VERSION' }
          : { type: 'RECONCILED_NEW_VERSION' },
      );
      return;
    }
    if (pending.reason === 'STALE') {
      dispatch({ type: 'RECONCILED_NEW_VERSION' });
      return;
    }
    if (pending.notice !== undefined) {
      dispatch({ type: 'DECISION_REFUSED', notice: pending.notice });
    }
  });

  const requestAccept = useCallback((versionId: string) => {
    decisionVersionRef.current = versionId;
    dispatch({ type: 'ACCEPT_REQUESTED', versionId });
  }, []);

  const requestReject = useCallback((versionId: string) => {
    decisionVersionRef.current = versionId;
    dispatch({ type: 'REJECT_REQUESTED', versionId });
  }, []);

  const dismissDecision = useCallback(() => {
    decisionVersionRef.current = '';
    dispatch({ type: 'DECISION_DISMISSED' });
  }, []);

  const confirmAccept = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    dispatch({ type: 'ACCEPT_SUBMITTED' });
    accept.mutate();
  }, [accept]);

  const confirmReject = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    dispatch({ type: 'REJECT_SUBMITTED' });
    reject.mutate();
  }, [reject]);

  const stepUpVerified = useCallback(() => {
    if (reconcileRef.current !== undefined) return;
    reconcileRef.current = {
      reason: 'STEP_UP',
      notice: undefined,
      phase: 'REQUESTED',
      baseline: 0,
    };
    dispatch({ type: 'STEP_UP_VERIFIED' });
  }, []);

  const reviewStale = useCallback(() => {
    decisionVersionRef.current = '';
    dispatch({ type: 'STALE_REVIEWED' });
  }, []);

  const uiStateOf = useCallback(
    (quote: CustomerQuotationResponse) => secureQuotationUiState(stage, quote),
    [stage],
  );

  return {
    linkState: sessionEndedRef.current ? { status: 'UNAVAILABLE' } : bootstrap.state,
    retryLink: bootstrap.retry,
    retryingLink: bootstrap.retrying,
    stage,
    uiStateOf,
    requestAccept,
    requestReject,
    dismissDecision,
    confirmAccept,
    confirmReject,
    stepUpVerified,
    reviewStale,
  };
}

'use client';

/**
 * The `/truy-cap/duyet-thiet-ke` controller (`APP6-S02` §6, §8, §13, §14, §15,
 * §16, §18, §19).
 *
 * It composes four things and owns the rules that connect them:
 *
 * - `useSecureLinkBootstrap`, which performs the locked capture → strip → body
 *   sequence and then **keeps** the credential, because the same grant
 *   authorises the customer's later approval or revision request;
 * - `reviewStageReducer`, which is what the customer is doing;
 * - the agreement consent set, which is keyed by the identity of the agreement
 *   set it was given for and therefore cannot survive a change of terms;
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
 * value of `isPending`, so a check on that would let both through; a ref
 * written synchronously is the only guard that closes the same-tick window
 * (§16).
 *
 * ### The single re-read
 *
 * `useReviewReconciliation` owns issuing it and knowing when it is over;
 * `reconcileVerdict` owns what its answer means. This file owns only the
 * routing: which refusal asks for one, and which stage move each verdict
 * produces. `DUPLICATE_OPERATION` deliberately asks for **none** — another
 * attempt at the same decision is still in flight, so nothing has changed to
 * re-read, and a re-read there would be the first iteration of a polling loop.
 *
 * Nothing here polls, and nothing here retries automatically.
 */
import { useCallback, useReducer, useRef, useState } from 'react';

import { normalizeApiClientError, type CustomerDesignReviewResponse } from '@embroidery/api-client';
import { useMutation } from '@tanstack/react-query';

import { useSecureLinkBootstrap, type SecureLinkState } from '../../secure-link-access';
import {
  approveDesignVersion,
  readCurrentDesignReview,
  requestDesignRevision,
} from '../api/secure-design-review.client';
import {
  EMPTY_CONSENT,
  acceptedAgreementsOf,
  agreementSignatureOf,
  allAccepted,
  toggleConsent,
  type AgreementConsent,
  type AgreementIdentity,
} from '../model/design-review-consent';
import {
  decisionFailureOf,
  endsSecureSession,
  isDecisionNotice,
  requiresReconciliationRead,
  type DecisionFailure,
} from '../model/design-review-failure';
import { verdictClearsDecision, type ReconcileReason } from '../model/design-review-reconciliation';
import {
  initialReviewStage,
  reviewStageReducer,
  submittableIntent,
  type ApprovalIntent,
  type DecisionNotice,
  type ReviewStage,
} from '../model/design-review-state';
import { useReviewReconciliation } from './use-review-reconciliation';

/** The one state the shell is given, and everything the screen needs beneath it. */
export interface SecureDesignReview {
  readonly linkState: SecureLinkState<CustomerDesignReviewResponse>;
  readonly retryLink: () => void;
  readonly retryingLink: boolean;
  readonly stage: ReviewStage;
  readonly consent: AgreementConsent;
  /**
   * Records or withdraws one tick, always against the whole set on screen.
   *
   * The set is passed with the agreement rather than remembered here, so a tick
   * can only ever be recorded against the exact effective set the customer is
   * looking at — which is what makes stale consent unrepresentable rather than
   * merely cleared (§9).
   */
  readonly setConsent: (
    agreements: readonly AgreementIdentity[],
    agreement: AgreementIdentity,
    accepted: boolean,
  ) => void;
  /** Whether every agreement currently on screen has been explicitly accepted. */
  readonly consentComplete: (agreements: readonly AgreementIdentity[]) => boolean;
  readonly requestApprove: (review: CustomerDesignReviewResponse) => void;
  readonly openRevisionForm: () => void;
  readonly dismissDecision: () => void;
  readonly confirmApprove: () => void;
  readonly submitRevision: (versionId: string, feedback: string) => void;
  readonly stepUpVerified: () => void;
  readonly reviewMismatch: () => void;
}

export function useSecureDesignReview(): SecureDesignReview {
  const bootstrap = useSecureLinkBootstrap<CustomerDesignReviewResponse>(
    (secret) => readCurrentDesignReview(secret),
    { retainCredentialAfterSuccess: true },
  );
  const [stage, dispatch] = useReducer(reviewStageReducer, initialReviewStage);
  const [consent, setConsentState] = useState<AgreementConsent>(EMPTY_CONSENT);

  /**
   * The exact decision the in-flight approval names.
   *
   * Mirrored out of the reducer because a mutation function declared with no
   * variables closes over whatever it captured at declaration; the ref is the
   * only value it reads, and it is written by the same handler that dispatches
   * the stage move, so the two can never name different versions, hashes or
   * agreement sets.
   */
  const intentRef = useRef<ApprovalIntent | undefined>(undefined);
  /** The exact version and words the in-flight revision request names. */
  const revisionRef = useRef<{ versionId: string; feedback: string }>({
    versionId: '',
    feedback: '',
  });
  const inFlightRef = useRef(false);

  /**
   * Set when a decision answers with a refusal that ends the grant.
   *
   * The bootstrap's own state cannot express this — its read succeeded — so the
   * screen substitutes the identical unavailable state rather than inventing a
   * fourth access frame. Indistinguishable from a link that never opened, which
   * is the point (§20).
   */
  const sessionEndedRef = useRef(false);
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  /**
   * The reconciliation's own cancel, reached through a ref.
   *
   * `endSession` is a dependency of the reconciliation hook and the
   * reconciliation is what `endSession` must cancel, so one of the two edges
   * has to be late-bound. A ref written on every render is the smaller of the
   * two indirections, and it can only ever hold the current one.
   */
  const cancelReconcileRef = useRef<() => void>(() => undefined);

  const endSession = useCallback(() => {
    sessionEndedRef.current = true;
    cancelReconcileRef.current();
    bootstrap.clearCredential();
    forceRender();
  }, [bootstrap]);

  /**
   * The one re-read, and what to do with its answer.
   *
   * Three of the four verdicts destroy the decision in play, and the rule for
   * which is stated once — in `verdictClearsDecision` — so this cannot clear
   * the intent on one path and forget it on another. The failure mode being
   * guarded against is an approval that survives the discovery that its design
   * has changed.
   */
  const reconcile = useReviewReconciliation({
    bootstrap,
    stageKind: stage.kind,
    intentRef,
    onCredentialLost: endSession,
    onReadFailed: () => {
      // The access state the shell renders already says the read failed; this
      // only releases the stage, so a later success is not stuck behind a
      // reconciling frame nothing will ever resolve.
      intentRef.current = undefined;
      dispatch({ type: 'DECISION_REFUSED', notice: 'TRANSIENT' });
    },
    onSettled: (verdict, notice) => {
      if (verdictClearsDecision(verdict)) {
        intentRef.current = undefined;
        setConsentState(EMPTY_CONSENT);
      }
      if (verdict === 'NEW_VERSION') {
        dispatch({ type: 'RECONCILED_NEW_VERSION' });
        return;
      }
      if (verdict === 'NEW_TERMS') {
        dispatch({ type: 'RECONCILED_NEW_TERMS' });
        return;
      }
      if (verdict === 'SAME_REVIEW') {
        // Evidence, never approval: back to the confirmation, to be pressed again.
        dispatch({ type: 'RECONCILED_SAME_REVIEW' });
        return;
      }
      if (notice !== undefined) dispatch({ type: 'DECISION_REFUSED', notice });
    },
  });

  cancelReconcileRef.current = reconcile.cancel;

  const startReconcile = useCallback(
    (reason: ReconcileReason, notice: DecisionNotice | undefined) => {
      reconcile.start(reason, notice);
      dispatch({ type: 'RECONCILE_STARTED' });
    },
    [reconcile],
  );

  const settleFailure = useCallback(
    (error: unknown) => {
      const failure: DecisionFailure = decisionFailureOf(normalizeApiClientError(error));
      if (endsSecureSession(failure)) {
        endSession();
        return;
      }
      if (failure === 'REVERIFICATION_REQUIRED') {
        // Evidence is missing, not consent. The approval is suspended inside
        // this same mounted session — never by navigating away (§7).
        dispatch({ type: 'STEP_UP_REQUIRED' });
        return;
      }
      if (failure === 'APPROVAL_VERSION_MISMATCH') {
        startReconcile('MISMATCH', undefined);
        return;
      }
      if (failure === 'TERMS_NOT_ACCEPTED') {
        startReconcile('TERMS', undefined);
        return;
      }
      if (!isDecisionNotice(failure)) return;
      if (requiresReconciliationRead(failure)) {
        startReconcile('NOTICE', failure);
        return;
      }
      // Everything left is bounded and stays put: a transient transport
      // failure, an unpublished policy, and `DUPLICATE_OPERATION`, which
      // reconciles nothing precisely so it cannot become a poll (§16).
      dispatch({ type: 'DECISION_REFUSED', notice: failure });
    },
    [endSession, startReconcile],
  );

  const approve = useMutation({
    mutationFn: () => {
      const intent = intentRef.current;
      if (intent === undefined) return Promise.reject(new Error('NO_APPROVAL_INTENT'));
      return bootstrap.runWithSecret((secret) =>
        approveDesignVersion(
          secret,
          intent.versionId,
          intent.documentHash,
          intent.acceptedAgreements,
        ),
      );
    },
    onSuccess: (outcome) => {
      // Committed, or a replay of a commit — `APP6-B11` answers a duplicate
      // submission with the identical snapshot and `replayed: true`, which is
      // an outcome to report, not a failure to hide (§16). Either way the
      // credential has no further use on this screen and is destroyed.
      bootstrap.clearCredential();
      dispatch({ type: 'APPROVE_COMMITTED', outcome });
    },
    onError: settleFailure,
    onSettled: () => {
      inFlightRef.current = false;
      approve.reset();
    },
    retry: false,
  });

  const revise = useMutation({
    mutationFn: () =>
      bootstrap.runWithSecret((secret) =>
        requestDesignRevision(secret, revisionRef.current.versionId, revisionRef.current.feedback),
      ),
    onSuccess: (outcome) => {
      bootstrap.clearCredential();
      dispatch({ type: 'REVISION_COMMITTED', outcome });
    },
    onError: settleFailure,
    onSettled: () => {
      inFlightRef.current = false;
      revise.reset();
    },
    retry: false,
  });

  const setConsent = useCallback(
    (agreements: readonly AgreementIdentity[], agreement: AgreementIdentity, accepted: boolean) => {
      setConsentState((current) => toggleConsent(current, agreements, agreement, accepted));
    },
    [],
  );

  const consentComplete = useCallback(
    (agreements: readonly AgreementIdentity[]) => allAccepted(consent, agreements),
    [consent],
  );

  /**
   * Captures the immutable decision snapshot and opens the confirmation.
   *
   * Everything the approval will submit is read **here**, from the review the
   * customer is looking at, and never again: the version, the server's own
   * stored document hash, and the exact ids and hashes of the agreements they
   * ticked. Nothing is rebuilt from "latest" at submit time, and no hash is
   * computed in the browser (§8).
   */
  const requestApprove = useCallback(
    (review: CustomerDesignReviewResponse) => {
      if (!allAccepted(consent, review.agreements)) return;
      const intent: ApprovalIntent = {
        versionId: review.designVersionId,
        version: review.version,
        documentHash: review.documentHash,
        acceptedAgreements: acceptedAgreementsOf(consent, review.agreements),
        agreementSignature: agreementSignatureOf(review.agreements),
      };
      intentRef.current = intent;
      dispatch({ type: 'APPROVE_REQUESTED', intent });
    },
    [consent],
  );

  const openRevisionForm = useCallback(() => {
    intentRef.current = undefined;
    dispatch({ type: 'REVISION_REQUESTED_FORM' });
  }, []);

  const dismissDecision = useCallback(() => {
    intentRef.current = undefined;
    dispatch({ type: 'DECISION_DISMISSED' });
  }, []);

  const confirmApprove = useCallback(() => {
    if (inFlightRef.current) return;
    if (submittableIntent(stage) === undefined) return;
    inFlightRef.current = true;
    dispatch({ type: 'APPROVE_SUBMITTED' });
    approve.mutate();
  }, [approve, stage]);

  const submitRevision = useCallback(
    (versionId: string, feedback: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      revisionRef.current = { versionId, feedback };
      dispatch({ type: 'REVISION_SUBMITTED' });
      revise.mutate();
    },
    [revise],
  );

  const stepUpVerified = useCallback(() => {
    if (reconcile.isPending()) return;
    reconcile.start('STEP_UP', undefined);
    dispatch({ type: 'STEP_UP_VERIFIED' });
  }, [reconcile]);

  const reviewMismatch = useCallback(() => {
    intentRef.current = undefined;
    dispatch({ type: 'MISMATCH_REVIEWED' });
  }, []);

  return {
    linkState: sessionEndedRef.current ? { status: 'UNAVAILABLE' } : bootstrap.state,
    retryLink: bootstrap.retry,
    retryingLink: bootstrap.retrying,
    stage,
    consent,
    setConsent,
    consentComplete,
    requestApprove,
    openRevisionForm,
    dismissDecision,
    confirmApprove,
    submitRevision,
    stepUpVerified,
    reviewMismatch,
  };
}

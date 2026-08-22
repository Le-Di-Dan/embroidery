/**
 * The `APP6-S02` decision flow as one explicit state model.
 *
 * A reducer rather than Zustand or a scatter of booleans, for the same reasons
 * `APP6-S01` gives: this is the interaction state of one screen, it must not
 * survive a reload — no authority defines resuming a half-made approval — and
 * one of the things it governs is when a bearer credential may be spent.
 *
 * Two layers, and the split is load-bearing:
 *
 * - {@link ReviewStage} is what the *customer* is doing: looking, confirming,
 *   re-verifying, waiting, or done. It holds no facts about the design.
 * - the review itself is the secure-link payload, owned by
 *   `useSecureLinkBootstrap` and replaced wholesale by a re-read. Copying any
 *   of it into this reducer would create a second answer to "what is the
 *   current version", which is precisely the disagreement §13 forbids.
 *
 * The one exception is {@link ApprovalIntent}, and it is the point of the
 * checkpoint rather than a leak: an approval names the exact version, the exact
 * stored document hash and the exact agreement set the customer *saw*, captured
 * once when they started the approval and never re-derived. If the payload were
 * consulted again at submit time, a version sent during a step-up would be
 * approved without ever having been looked at. None of the three is secret and
 * all three are server-published values, so they may live in state; the secure
 * credential may not, and no action in this file carries one.
 */
import type {
  DesignApprovedResponse,
  DesignRevisionRequestedResponse,
} from '@embroidery/api-client';

import type { AgreementIdentity } from './design-review-consent';
import type { DecisionFailure } from './design-review-failure';

/**
 * The immutable, non-secret decision snapshot an approval submits.
 *
 * Every field is a value B10 returned. Nothing here is computed in the browser:
 * the document hash is the server's stored value read off the response, never a
 * hash this build produced, and the agreements are ids and hashes rather than
 * text (§8).
 */
export interface ApprovalIntent {
  readonly versionId: string;
  /** The version *number*, captured for display. The id is the authority. */
  readonly version: number;
  readonly documentHash: string;
  readonly acceptedAgreements: readonly AgreementIdentity[];
  /** The signature of the agreement set at capture, for the post-step-up compare. */
  readonly agreementSignature: string;
}

/**
 * Where the customer is in the decision.
 *
 * `RECONCILING` is the window between a refusal (or a completed step-up) and
 * the single re-read that follows it — a real phase, not a spinner, because it
 * is the one moment the screen knows its version might already be out of date.
 */
export type ReviewStageKind =
  | 'REVIEW'
  | 'APPROVE_CONFIRM'
  | 'STEP_UP'
  | 'RECONCILING'
  | 'APPROVING'
  | 'APPROVED'
  | 'REVISION_FORM'
  | 'REVISION_SUBMITTING'
  | 'REVISION_REQUESTED'
  | 'VERSION_MISMATCH'
  | 'TERMS_CHANGED';

/** A one-shot alert on the review card, cleared by the next action. */
export type DecisionNotice = Exclude<
  DecisionFailure,
  'REVERIFICATION_REQUIRED' | 'APPROVAL_VERSION_MISMATCH' | 'TERMS_NOT_ACCEPTED' | 'UNAVAILABLE'
>;

export interface ReviewStage {
  readonly kind: ReviewStageKind;
  /**
   * The exact decision snapshot in play, or `undefined` while the customer is
   * only looking.
   */
  readonly intent: ApprovalIntent | undefined;
  readonly approved: DesignApprovedResponse | undefined;
  readonly revisionRequested: DesignRevisionRequestedResponse | undefined;
  readonly notice: DecisionNotice | undefined;
}

export const initialReviewStage: ReviewStage = {
  kind: 'REVIEW',
  intent: undefined,
  approved: undefined,
  revisionRequested: undefined,
  notice: undefined,
};

export type ReviewAction =
  | { type: 'APPROVE_REQUESTED'; intent: ApprovalIntent }
  | { type: 'REVISION_REQUESTED_FORM' }
  | { type: 'DECISION_DISMISSED' }
  | { type: 'APPROVE_SUBMITTED' }
  | { type: 'REVISION_SUBMITTED' }
  | { type: 'STEP_UP_REQUIRED' }
  | { type: 'STEP_UP_VERIFIED' }
  | { type: 'RECONCILE_STARTED' }
  | { type: 'RECONCILED_SAME_REVIEW' }
  | { type: 'RECONCILED_NEW_VERSION' }
  | { type: 'RECONCILED_NEW_TERMS' }
  | { type: 'APPROVE_COMMITTED'; outcome: DesignApprovedResponse }
  | { type: 'REVISION_COMMITTED'; outcome: DesignRevisionRequestedResponse }
  | { type: 'DECISION_REFUSED'; notice: DecisionNotice }
  | { type: 'MISMATCH_REVIEWED' };

export function reviewStageReducer(state: ReviewStage, action: ReviewAction): ReviewStage {
  switch (action.type) {
    case 'APPROVE_REQUESTED':
      return { ...initialReviewStage, kind: 'APPROVE_CONFIRM', intent: action.intent };
    case 'REVISION_REQUESTED_FORM':
      // No intent: a revision request carries no hash and no agreements, so
      // there is nothing about the terms or the artwork to freeze (§18).
      return { ...initialReviewStage, kind: 'REVISION_FORM' };
    case 'DECISION_DISMISSED':
      return initialReviewStage;
    case 'APPROVE_SUBMITTED':
      return { ...state, kind: 'APPROVING', notice: undefined };
    case 'REVISION_SUBMITTED':
      return { ...state, kind: 'REVISION_SUBMITTING', notice: undefined };
    case 'STEP_UP_REQUIRED':
      // The approval is suspended, not abandoned: `intent` survives, because it
      // is the thing the re-read after verification is compared to (§13).
      return { ...state, kind: 'STEP_UP', notice: undefined };
    case 'STEP_UP_VERIFIED':
      return { ...state, kind: 'RECONCILING', notice: undefined };
    case 'RECONCILE_STARTED':
      // The same visible phase, entered from a *refusal* rather than from a
      // completed step-up. Separate action, one transition: a test can then say
      // which path put the screen here, and neither can be mistaken for the
      // other when the re-read settles.
      return { ...state, kind: 'RECONCILING', notice: undefined };
    case 'RECONCILED_SAME_REVIEW':
      // Verification is evidence, never consent. The customer returns to the
      // confirmation and must press approve again (§13).
      return { ...state, kind: 'APPROVE_CONFIRM', notice: undefined };
    case 'RECONCILED_NEW_VERSION':
      // The artwork moved. Intent and consent both die; the customer decides
      // again from scratch against `710:203` (§13, §14).
      return { ...initialReviewStage, kind: 'VERSION_MISMATCH' };
    case 'RECONCILED_NEW_TERMS':
      // Only the terms moved. Deliberately not reported as a version mismatch
      // (§13): the design is the one the customer already reviewed.
      return { ...initialReviewStage, kind: 'TERMS_CHANGED' };
    case 'APPROVE_COMMITTED':
      return { ...initialReviewStage, kind: 'APPROVED', approved: action.outcome };
    case 'REVISION_COMMITTED':
      return {
        ...initialReviewStage,
        kind: 'REVISION_REQUESTED',
        revisionRequested: action.outcome,
      };
    case 'DECISION_REFUSED':
      // Back to looking, with the reason stated. A refused decision never
      // half-survives: the customer decides again, explicitly, or does not.
      return { ...initialReviewStage, notice: action.notice };
    case 'MISMATCH_REVIEWED':
      return initialReviewStage;
    default:
      return state;
  }
}

/**
 * Whether the stage still holds an approval the screen may submit.
 *
 * Used by the controller's same-tick guard and by the confirmation dialog, so
 * neither can act on a stage whose intent was cleared by a reconciliation.
 */
export function submittableIntent(stage: ReviewStage): ApprovalIntent | undefined {
  return stage.kind === 'APPROVE_CONFIRM' || stage.kind === 'APPROVING' ? stage.intent : undefined;
}

/** The longest feedback `RequestDesignRevisionBody` accepts. */
export const REVISION_FEEDBACK_MAX = 2000;

export type RevisionFeedbackProblem = 'REQUIRED' | 'TOO_LONG';

/**
 * Whether the typed feedback may be sent, and why not when it may not.
 *
 * Trimmed before every check, because `minLength: 1` on the wire would accept a
 * string of spaces — which tells the workshop that something is wrong and
 * nothing about what. The length is measured on the trimmed value for the same
 * reason the server stores it trimmed.
 */
export function revisionFeedbackProblem(feedback: string): RevisionFeedbackProblem | undefined {
  const trimmed = feedback.trim();
  if (trimmed.length === 0) return 'REQUIRED';
  if (trimmed.length > REVISION_FEEDBACK_MAX) return 'TOO_LONG';
  return undefined;
}

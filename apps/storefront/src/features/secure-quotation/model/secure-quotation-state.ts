/**
 * The `APP6-S01` decision flow as one explicit state model.
 *
 * A reducer rather than Zustand or a scatter of booleans, for the same reasons
 * `APP4-S01` gives: this is the interaction state of one screen, it must not
 * survive a reload — no authority defines resuming a half-made decision — and
 * one of the things it governs is when a bearer credential may be spent.
 *
 * Two layers, and the split is load-bearing:
 *
 * - {@link QuoteStage} is what the *customer* is doing: looking, confirming,
 *   re-verifying, waiting, or done. It holds no facts about the quotation.
 * - the quotation itself is the secure-link payload, owned by
 *   `useSecureLinkBootstrap` and replaced wholesale by a re-read. Copying any
 *   of it into this reducer would create a second answer to "what is the
 *   current version", which is precisely the disagreement §11 forbids.
 *
 * {@link secureQuotationUiState} then answers *which approved frame is on
 * screen* as a pure function of the two. Expiry lives there and not in the
 * stage, because expiry is a fact about the offer that the customer's actions
 * cannot change — modelling it as a stage would let the screen believe an
 * expired quotation is acceptable simply because nothing had transitioned yet.
 *
 * Neither the secure-link token nor a verification code appears anywhere in
 * this file. There is no action carrying either, so no snapshot of this state
 * can contain one.
 */
import type { QuotationAcceptedResponse, QuotationRejectedResponse } from '@embroidery/api-client';

import type { DecisionFailure } from './secure-quotation-failure';

/**
 * Where the customer is in the decision.
 *
 * `RECONCILING` is the window between a completed step-up and the re-read that
 * follows it — a real phase, not a spinner, because it is the one moment the
 * screen knows its version might already be out of date (§9).
 */
export type QuoteStageKind =
  | 'READY'
  | 'ACCEPT_CONFIRM'
  | 'STEP_UP'
  | 'RECONCILING'
  | 'ACCEPTING'
  | 'ACCEPTED'
  | 'REJECT_CONFIRM'
  | 'REJECTING'
  | 'REJECTED'
  | 'STALE';

/** A one-shot alert on the quotation card, cleared by the next action. */
export type DecisionNotice = Exclude<
  DecisionFailure,
  'REVERIFICATION_REQUIRED' | 'QUOTE_VERSION_STALE' | 'UNAVAILABLE'
>;

export interface QuoteStage {
  readonly kind: QuoteStageKind;
  /**
   * The exact version the customer's current decision names.
   *
   * Captured when they first press accept or reject and never re-derived, so a
   * step-up that takes long enough for the workshop to send a new version is
   * compared against what the customer actually saw rather than against
   * whatever is current by then (§9, §11).
   */
  readonly decisionVersionId: string | undefined;
  readonly accepted: QuotationAcceptedResponse | undefined;
  readonly rejected: QuotationRejectedResponse | undefined;
  readonly notice: DecisionNotice | undefined;
}

export const initialQuoteStage: QuoteStage = {
  kind: 'READY',
  decisionVersionId: undefined,
  accepted: undefined,
  rejected: undefined,
  notice: undefined,
};

export type QuoteAction =
  | { type: 'ACCEPT_REQUESTED'; versionId: string }
  | { type: 'REJECT_REQUESTED'; versionId: string }
  | { type: 'DECISION_DISMISSED' }
  | { type: 'ACCEPT_SUBMITTED' }
  | { type: 'REJECT_SUBMITTED' }
  | { type: 'STEP_UP_REQUIRED' }
  | { type: 'STEP_UP_VERIFIED' }
  | { type: 'RECONCILE_STARTED' }
  | { type: 'RECONCILED_SAME_VERSION' }
  | { type: 'RECONCILED_NEW_VERSION' }
  | { type: 'ACCEPT_COMMITTED'; outcome: QuotationAcceptedResponse }
  | { type: 'REJECT_COMMITTED'; outcome: QuotationRejectedResponse }
  | { type: 'DECISION_REFUSED'; notice: DecisionNotice }
  | { type: 'STALE_REVIEWED' };

export function quoteStageReducer(state: QuoteStage, action: QuoteAction): QuoteStage {
  switch (action.type) {
    case 'ACCEPT_REQUESTED':
      return { ...initialQuoteStage, kind: 'ACCEPT_CONFIRM', decisionVersionId: action.versionId };
    case 'REJECT_REQUESTED':
      return { ...initialQuoteStage, kind: 'REJECT_CONFIRM', decisionVersionId: action.versionId };
    case 'DECISION_DISMISSED':
      return initialQuoteStage;
    case 'ACCEPT_SUBMITTED':
      return { ...state, kind: 'ACCEPTING', notice: undefined };
    case 'REJECT_SUBMITTED':
      return { ...state, kind: 'REJECTING', notice: undefined };
    case 'STEP_UP_REQUIRED':
      // The decision is suspended, not abandoned: `decisionVersionId` survives,
      // because it is the thing the re-read after verification is compared to.
      return { ...state, kind: 'STEP_UP', notice: undefined };
    case 'STEP_UP_VERIFIED':
      return { ...state, kind: 'RECONCILING', notice: undefined };
    case 'RECONCILE_STARTED':
      // The same visible phase, entered from a *refusal* rather than from a
      // completed step-up. Separate action, one transition: a test can then say
      // which of the two paths put the screen here, and neither path can be
      // mistaken for the other when the re-read settles.
      return { ...state, kind: 'RECONCILING', notice: undefined };
    case 'RECONCILED_SAME_VERSION':
      // Verification is evidence, never consent. The customer returns to the
      // confirmation and must press accept again (§9).
      return { ...state, kind: 'ACCEPT_CONFIRM', notice: undefined };
    case 'RECONCILED_NEW_VERSION':
      return { ...initialQuoteStage, kind: 'STALE' };
    case 'ACCEPT_COMMITTED':
      return { ...initialQuoteStage, kind: 'ACCEPTED', accepted: action.outcome };
    case 'REJECT_COMMITTED':
      return { ...initialQuoteStage, kind: 'REJECTED', rejected: action.outcome };
    case 'DECISION_REFUSED':
      // Back to looking, with the reason stated. A refused decision never
      // half-survives: the customer decides again, explicitly, or does not.
      return { ...initialQuoteStage, notice: action.notice };
    case 'STALE_REVIEWED':
      return initialQuoteStage;
    default:
      return state;
  }
}

/** The quotation facts this model needs, and only those. */
export interface QuoteAcceptability {
  readonly status: string;
  readonly quotationStatus: string;
  readonly expired: boolean;
}

/**
 * Whether the offer on screen is one the customer may still accept or decline.
 *
 * Both stored states are checked, not just the version's: `APP6-B05` decides
 * against the quotation header **and** the version row, so a screen that looked
 * at one of them would offer a control the server is certain to refuse.
 *
 * `expired` is the server's own derivation at the instant of the read
 * (`APP6-G01`: expiry is `now >= valid_until`, independent of any sweep), and it
 * is taken as given. Nothing here recomputes it from `validUntil`, because a
 * browser clock that is minutes fast would then hide a live offer.
 */
export function isDecidable(quote: QuoteAcceptability): boolean {
  return !quote.expired && quote.status === 'SENT' && quote.quotationStatus === 'SENT';
}

/** Exactly the approved `APP6-S01` frames, one name per drawn state. */
export type QuoteUiState =
  | 'READY'
  | 'ACCEPT_CONFIRM'
  | 'STEP_UP'
  | 'RECONCILING'
  | 'ACCEPTING'
  | 'ACCEPTED'
  | 'REJECT_CONFIRM'
  | 'REJECTING'
  | 'REJECTED'
  | 'STALE'
  | 'EXPIRED';

/**
 * Which approved frame is on screen right now.
 *
 * Pure, so the answer can be asserted directly in a test rather than inferred
 * from whatever happens to have rendered, and so the same stage can never
 * produce two different screens.
 *
 * The order matters. A stage the customer drove wins over the read's own
 * verdict, because a committed acceptance must keep showing its outcome even as
 * the underlying quotation reads `ACCEPTED` a moment later. Only once the
 * customer is merely *looking* does the stored state decide:
 *
 * - already accepted or rejected — by them in another tab, or by this screen
 *   before a remount — renders the committed outcome from the read's own facts
 *   rather than inventing a state the design never drew;
 * - lapsed renders `702:129`, which offers no acceptance control at all;
 * - anything else that is not a live `SENT` offer is not actionable and is
 *   reported as lapsed, which is the only approved frame that says "there is
 *   nothing to decide here" without claiming a decision was made.
 */
export function secureQuotationUiState(stage: QuoteStage, quote: QuoteAcceptability): QuoteUiState {
  if (stage.kind !== 'READY') return stage.kind;
  if (quote.status === 'ACCEPTED') return 'ACCEPTED';
  if (quote.status === 'REJECTED') return 'REJECTED';
  return isDecidable(quote) ? 'READY' : 'EXPIRED';
}

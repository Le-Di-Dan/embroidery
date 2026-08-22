'use client';

import { useId } from 'react';

import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import type { ReviewStageKind } from '../model/design-review-state';

/**
 * The two customer actions, and the reason the first one is unavailable
 * (`707:55`, `709:3`).
 *
 * ## Approve is disabled, and the reason is programmatically attached
 *
 * `709:3` is the required state for "terms not all accepted", and a control
 * that is merely greyed out states nothing to a screen reader beyond
 * *unavailable*. So the button carries `aria-describedby` pointing at the
 * sentence that says how many agreements are still unticked, and that sentence
 * is real text on the page rather than a `title` attribute — which no touch
 * device shows and no screen reader reliably announces.
 *
 * A disabled `<button>` rather than a removed one, deliberately, and the
 * opposite of the `APP6-S01` ruling for an expired quotation: there, nothing
 * could ever make the offer acceptable again, so offering a control at all
 * would have been a lie. Here the control becomes usable the moment the
 * customer ticks the last box, so it must be visible for them to see what
 * ticking leads to.
 *
 * ## Requesting a revision is never gated on consent
 *
 * It commits nothing, binds no terms and requires no step-up, so it stays
 * available whether or not a single agreement has been ticked. Gating it would
 * make a customer accept terms in order to say they do not want the design.
 */
export interface ReviewActionsProps {
  readonly stageKind: ReviewStageKind;
  readonly canApprove: boolean;
  /** How many agreements are still unticked. `0` when the blocker is elsewhere. */
  readonly outstandingAgreements: number;
  /** Whether the stored document could be drawn at all. */
  readonly previewRenderable: boolean;
  readonly onApprove: () => void;
  readonly onRequestRevision: () => void;
  readonly onReviewLatest: () => void;
}

export function ReviewActions({
  stageKind,
  canApprove,
  outstandingAgreements,
  previewRenderable,
  onApprove,
  onRequestRevision,
  onReviewLatest,
}: ReviewActionsProps) {
  const reasonId = useId();

  if (stageKind === 'APPROVED' || stageKind === 'REVISION_REQUESTED') return null;

  if (stageKind === 'VERSION_MISMATCH') {
    return (
      <div className="secure-design-review__actions">
        <button
          type="button"
          className="secure-design-review__button secure-design-review__button--primary"
          onClick={onReviewLatest}
        >
          {COPY.actions.reviewLatest}
        </button>
      </div>
    );
  }

  const busy = stageKind === 'APPROVING' || stageKind === 'REVISION_SUBMITTING';
  const approvable = canApprove && previewRenderable && !busy;
  const showReason = !approvable && outstandingAgreements > 0;

  return (
    <div className="secure-design-review__actions">
      {showReason ? (
        <p className="secure-design-review__actions-reason" id={reasonId}>
          {COPY.agreements.outstanding(outstandingAgreements)}
        </p>
      ) : null}

      <button
        type="button"
        className="secure-design-review__button secure-design-review__button--primary"
        disabled={!approvable}
        aria-describedby={showReason ? reasonId : undefined}
        data-testid="design-review-approve"
        onClick={onApprove}
      >
        {stageKind === 'APPROVING' ? COPY.actions.approving : COPY.actions.approve}
      </button>

      <button
        type="button"
        className="secure-design-review__button"
        disabled={busy}
        data-testid="design-review-request-revision"
        onClick={onRequestRevision}
      >
        {COPY.actions.requestRevision}
      </button>
    </div>
  );
}

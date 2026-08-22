'use client';

import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import type { ApprovalIntent } from '../model/design-review-state';
import { ReviewDialog } from './review-dialog';

/**
 * The approval confirmation (`710:3`, before the step-up branch).
 *
 * The last thing between the customer and an immutable Approval Snapshot, and
 * it names what is actually being approved: the exact version number from the
 * intent captured when they pressed approve, never a value re-read from a
 * payload that may have moved since.
 *
 * It also states the boundary of what approval does — no payment, no order, no
 * production — because that is the sentence a customer is most likely to assume
 * wrongly at exactly this moment, and `APP6-D01` prints it on the confirmation
 * for the same reason.
 *
 * The intent's document hash and agreement ids are deliberately **not**
 * displayed. They are the machinery of exactness, not information a customer
 * can act on, and the hash already appears once beside the artwork where it
 * belongs.
 */
export interface ApproveConfirmDialogProps {
  readonly intent: ApprovalIntent;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ApproveConfirmDialog({ intent, onConfirm, onCancel }: ApproveConfirmDialogProps) {
  return (
    <ReviewDialog title={COPY.approveConfirm.title} onDismiss={onCancel}>
      <p className="secure-design-review__dialog-body">{COPY.approveConfirm.body}</p>
      <p className="secure-design-review__dialog-binds">
        {COPY.approveConfirm.binds(intent.version)}
      </p>
      <p className="secure-design-review__dialog-note">{COPY.approveConfirm.terms}</p>
      <p className="secure-design-review__dialog-note">{COPY.approveConfirm.noPayment}</p>

      <div className="secure-design-review__dialog-actions">
        <button
          type="button"
          className="secure-design-review__button secure-design-review__button--primary"
          data-testid="design-review-approve-confirm"
          onClick={onConfirm}
        >
          {COPY.approveConfirm.confirm}
        </button>
        <button type="button" className="secure-design-review__button" onClick={onCancel}>
          {COPY.approveConfirm.cancel}
        </button>
      </div>
    </ReviewDialog>
  );
}

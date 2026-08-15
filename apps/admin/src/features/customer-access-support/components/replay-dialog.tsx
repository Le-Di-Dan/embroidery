'use client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';
import { SupportDialog } from './support-dialog';

interface ReplayDialogProps {
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

const COPY = CUSTOMER_ACCESS_COPY.replay;

/**
 * The replay confirmation.
 *
 * Confirmed rather than immediate because a replay puts a real message in front
 * of a real person, and an accidental click is a second copy of a credential
 * arriving in someone's inbox. It is **not** an `alertdialog`: nothing is
 * destroyed, the original failure record is kept untouched as evidence, and the
 * body says both of those things so the operator knows what they are agreeing to.
 *
 * There is no body to build and no field to fill: the notification id in the
 * path is the entire input, and everything the replay needs is read server-side
 * from the persisted records. That is why this dialog collects nothing — a form
 * field here would be a field through which a credential could be redirected.
 */
export function ReplayDialog({ busy, onConfirm, onCancel }: ReplayDialogProps) {
  return (
    <SupportDialog
      title={COPY.title}
      describedBy="replay-dialog-body"
      testId="replay-dialog"
      destructive={false}
      onDismiss={onCancel}
    >
      <p className="customer-access-dialog__body" id="replay-dialog-body">
        {COPY.body}
      </p>
      <p className="customer-access-dialog__hint">{COPY.queuedNote}</p>

      <div className="customer-access-dialog__actions">
        <button
          type="button"
          className="customer-access-dialog__primary"
          data-testid="replay-confirm"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? COPY.working : COPY.confirm}
        </button>
        <button
          type="button"
          className="customer-access-dialog__secondary"
          data-testid="replay-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          {COPY.cancel}
        </button>
      </div>
    </SupportDialog>
  );
}

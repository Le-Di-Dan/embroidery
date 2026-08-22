'use client';

import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import { QuotationDialog } from './quotation-dialog';

/**
 * The explicit second act before a rejection commits.
 *
 * Declining needs no re-verification — `APP6-B05`'s rejection path requires
 * only the grant, because refusing an offer commits nothing (`702:61`, §14) —
 * but it is still irreversible for that version, so it still asks once.
 *
 * The body is the one place this screen states what a rejection does *not* do:
 * the custom request is not cancelled, and the workshop may send another
 * version. Without that sentence a customer declining a price would reasonably
 * assume they had just cancelled their whole order.
 */
interface RejectConfirmDialogProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function RejectConfirmDialog({ onConfirm, onCancel }: RejectConfirmDialogProps) {
  return (
    <QuotationDialog title={COPY.rejectConfirm.title} onDismiss={onCancel}>
      <p className="secure-quotation__dialog-body">{COPY.rejectConfirm.body}</p>
      <div className="secure-quotation__dialog-actions">
        <button type="button" className="secure-quotation__button" onClick={onCancel}>
          {COPY.rejectConfirm.cancel}
        </button>
        <button
          type="button"
          className="secure-quotation__button secure-quotation__button--danger"
          onClick={onConfirm}
        >
          {COPY.rejectConfirm.confirm}
        </button>
      </div>
    </QuotationDialog>
  );
}

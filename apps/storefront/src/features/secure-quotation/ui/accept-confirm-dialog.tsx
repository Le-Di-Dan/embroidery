'use client';

import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import { QuotationDialog } from './quotation-dialog';

/**
 * The explicit second act before an acceptance commits (`701:63` … `701:87`).
 *
 * It exists because §9 is unambiguous: a completed step-up is *evidence*, never
 * consent. When re-verification interrupts an acceptance and the re-read after
 * it finds the same version still current, the customer lands back here and
 * must press *Xác nhận và chấp nhận* again. Nothing accepts on their behalf on
 * the strength of a code they typed a moment earlier.
 *
 * The total is printed in the body for the same reason: the thing being
 * committed to is a specific amount on a specific version, so it is stated at
 * the moment of committing rather than left on the card behind the scrim. It is
 * the already-formatted server figure, passed in — this component never sees a
 * raw amount and never computes one.
 */
interface AcceptConfirmDialogProps {
  readonly total: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function AcceptConfirmDialog({ total, onConfirm, onCancel }: AcceptConfirmDialogProps) {
  return (
    <QuotationDialog title={COPY.acceptConfirm.title} onDismiss={onCancel}>
      <p className="secure-quotation__dialog-body">{COPY.acceptConfirm.body(total)}</p>
      <p className="secure-quotation__dialog-note">{COPY.acceptConfirm.note}</p>
      <div className="secure-quotation__dialog-actions">
        <button type="button" className="secure-quotation__button" onClick={onCancel}>
          {COPY.acceptConfirm.cancel}
        </button>
        <button
          type="button"
          className="secure-quotation__button secure-quotation__button--primary"
          onClick={onConfirm}
        >
          {COPY.acceptConfirm.confirm}
        </button>
      </div>
    </QuotationDialog>
  );
}

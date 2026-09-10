'use client';

import { SELLABILITY_COPY } from '../model/sellability-copy';
import type { SellabilityWriteFailure } from '../model/sellability-failure';
import { SellabilityDialog } from './sellability-dialog';
import { SellabilityFailureNote } from './sellability-failure-note';

/** Which structural break is being confirmed. */
export type StructureBreakKind = 'lastVariant' | 'lastSku';

interface StructureBreakDialogProps {
  readonly kind: StructureBreakKind;
  /** The variant title or the SKU code, whichever this confirmation is about. */
  readonly subject: string;
  readonly pending: boolean;
  readonly failure: SellabilityWriteFailure | null;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

const FAILURE_NOTE_ID = 'structure-break-failure';

/**
 * The two confirmations that precede making a published product unbuyable
 * (`975:254`, `976:300`).
 *
 * One component for both because they are the same conversation about two
 * different rows: this is the last one, here is the arithmetic afterwards, here
 * is what the customer sees, the product stays published, and this is not
 * "sold out". Splitting them into two files would duplicate that structure and
 * let the two drift into saying different things about the same consequence.
 *
 * ### What it must state, and why each sentence is load-bearing
 *
 * *The arithmetic.* "0 phiên bản đang hoạt động" is checkable; "this may affect
 * availability" is not.
 *
 * *That the product stays published.* Nothing auto-unpublishes, and an operator
 * who assumed otherwise would leave a live, unbuyable product behind believing
 * the system had taken it down for them.
 *
 * *That this is not `hết hàng`.* Sold out is stock 0 on a SKU that is still
 * selling. This is the absence of anything to sell, and it is repaired
 * differently. The last-SKU dialog is where that mistake would be easiest to
 * make, so it is where the distinction is stated.
 *
 * ### The safe action is the default
 *
 * `Giữ nguyên` comes first and is the primary button; the state-breaking action
 * is second and is styled as the destructive one. Focus opens on the panel, so
 * neither is armed by a stray keypress, and `Escape` keeps the product intact.
 */
export function StructureBreakDialog({
  kind,
  subject,
  pending,
  failure,
  onConfirm,
  onDismiss,
}: StructureBreakDialogProps) {
  const copy =
    kind === 'lastVariant' ? SELLABILITY_COPY.variantDeactivate : SELLABILITY_COPY.skuDeactivate;

  return (
    <SellabilityDialog
      title={copy.title}
      subtitle={copy.subtitle(subject)}
      testId={`structure-break-${kind}`}
      onDismiss={pending ? () => undefined : onDismiss}
    >
      <div className="product-sellability-dialog__body">
        <p>{copy.body}</p>
        <p className="product-sellability-dialog__arithmetic" data-testid="structure-arithmetic">
          {copy.arithmetic}
        </p>
        <p>{copy.consequence}</p>
        <p className="product-sellability-dialog__emphasis">{copy.remainsPublished}</p>
        <p className="product-sellability-dialog__note">{copy.notSoldOut}</p>
      </div>

      {failure === null ? null : <SellabilityFailureNote failure={failure} id={FAILURE_NOTE_ID} />}

      <div className="product-sellability-dialog__actions">
        <button
          type="button"
          className="product-sellability-dialog__primary"
          disabled={pending}
          data-testid="structure-break-keep"
          onClick={onDismiss}
        >
          {copy.keep}
        </button>
        <button
          type="button"
          className="product-sellability-dialog__destructive"
          disabled={pending}
          data-testid="structure-break-confirm"
          onClick={onConfirm}
        >
          {copy.confirm}
        </button>
      </div>
    </SellabilityDialog>
  );
}

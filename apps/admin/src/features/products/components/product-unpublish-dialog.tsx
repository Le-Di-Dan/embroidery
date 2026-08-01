'use client';

import { PRODUCT_PUBLICATION_COPY } from '../model/product-publication-copy';
import { ProductDialog } from './product-dialog';

interface ProductUnpublishDialogProps {
  readonly pending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The unpublish confirmation (`442:205` — Gỡ xuất bản sản phẩm này?).
 *
 * `role="alertdialog"` rather than `dialog`, as the approved handoff requires:
 * this interrupts to prevent a consequential change, and assistive technology
 * should announce it accordingly.
 *
 * The body says what unpublish is *not*. Operators reasonably assume that
 * removing something from public view deletes or archives it, and here it does
 * neither — the slug, images, category and price all survive and the product
 * simply becomes an editable draft again. Leaving that to inference is how a
 * cautious operator never uses the feature, or a confident one expects their
 * data to be gone.
 *
 * There is no reason field. The contract's body is `.strict()` and accepts only
 * `expectedUpdatedAt`, so a reason input would collect text the server would
 * reject the request for sending.
 *
 * While the command is in flight the dialog stops being dismissible and the
 * primary action is disabled. A second press cannot fire the mutation twice,
 * and the dialog cannot vanish while a request it owns is still outstanding.
 */
export function ProductUnpublishDialog({
  pending,
  onConfirm,
  onCancel,
}: ProductUnpublishDialogProps) {
  return (
    <ProductDialog
      role="alertdialog"
      dismissible={!pending}
      title={PRODUCT_PUBLICATION_COPY.unpublishDialog.title}
      describedBy="product-unpublish-body"
      onClose={onCancel}
      footer={
        <div className="product-dialog__actions">
          <button
            type="button"
            className="product-dialog__secondary"
            onClick={onCancel}
            disabled={pending}
          >
            {PRODUCT_PUBLICATION_COPY.unpublishDialog.cancel}
          </button>
          <button
            type="button"
            className="product-dialog__primary"
            onClick={onConfirm}
            disabled={pending}
            aria-disabled={pending}
          >
            {pending
              ? PRODUCT_PUBLICATION_COPY.published.unpublishing
              : PRODUCT_PUBLICATION_COPY.unpublishDialog.confirm}
          </button>
        </div>
      }
    >
      <div id="product-unpublish-body">
        <p className="product-dialog__body-text">{PRODUCT_PUBLICATION_COPY.unpublishDialog.body}</p>
        <p className="product-dialog__body-text product-dialog__body-text--strong">
          {PRODUCT_PUBLICATION_COPY.unpublishDialog.reassurance}
        </p>
      </div>
    </ProductDialog>
  );
}

'use client';

import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';
import { ProductDialog } from './product-dialog';

interface ProductMediaRemoveDialogProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Confirmation before removing the primary image (`940:187`).
 *
 * The **only** tile action that confirms, and the reason is specific: removing
 * a non-primary image changes this screen, while removing the primary changes
 * what the product looks like everywhere else — the catalog card, Discover, the
 * `og:image` on every shared link — because the image at position 2 silently
 * becomes the new primary.
 *
 * `alertdialog`, for the same reason the unpublish confirmation is one: it
 * interrupts to prevent a consequential change rather than to collect input.
 *
 * Nothing is persisted by confirming. The removal is staged like every other
 * media action and committed by the one save; the dialog is about the *promotion
 * the operator did not ask for*, not about a request.
 */
export function ProductMediaRemoveDialog({ onConfirm, onCancel }: ProductMediaRemoveDialogProps) {
  return (
    <ProductDialog
      title={PRODUCT_MEDIA_COPY.removePrimary.title}
      describedBy="product-media-remove-body"
      role="alertdialog"
      onClose={onCancel}
      footer={
        <div className="product-dialog__actions">
          <button type="button" className="product-dialog__secondary" onClick={onCancel}>
            {PRODUCT_MEDIA_COPY.removePrimary.cancel}
          </button>
          <button type="button" className="product-dialog__primary" onClick={onConfirm}>
            {PRODUCT_MEDIA_COPY.removePrimary.confirm}
          </button>
        </div>
      }
    >
      <p className="product-dialog__body-text" id="product-media-remove-body">
        {PRODUCT_MEDIA_COPY.removePrimary.body}
      </p>
    </ProductDialog>
  );
}

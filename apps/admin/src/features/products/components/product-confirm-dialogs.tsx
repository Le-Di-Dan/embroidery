'use client';

import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import { ProductDialog } from './product-dialog';

interface ConflictDialogProps {
  readonly onReload: () => void;
  readonly onClose: () => void;
  /**
   * What the conflict is *about*, when the generic wording would be wrong.
   *
   * A published product's media save has its own approved sentences
   * (`APP12-M01.D1` §Q — "Ảnh sản phẩm đã thay đổi ở nơi khác"): the operator
   * changed no field, so telling them "dữ liệu trên máy chủ đã thay đổi kể từ
   * lần bạn mở sản phẩm này" names the wrong thing and points at the wrong
   * next step. The mechanism is identical, so the dialog is shared and only the
   * words differ.
   */
  readonly title?: string;
  readonly body?: string;
}

/**
 * The optimistic-concurrency conflict (`521:284` — PRODUCT_VERSION_CONFLICT).
 *
 * There is no force-save and no "overwrite anyway": the server rejected the
 * write because someone else changed the record, and offering to push through
 * would silently discard their change. Reload is the only forward path, and it
 * refetches the authoritative record — including a fresh concurrency token,
 * since retrying with the stale one could only fail again.
 *
 * The explanation never contains a timestamp, a token value or a request id.
 * Those are transport facts; the operator needs to know someone else edited it.
 */
export function ProductConflictDialog({ onReload, onClose, title, body }: ConflictDialogProps) {
  return (
    <ProductDialog
      title={title ?? PRODUCT_FORM_COPY.conflict.title}
      describedBy="product-conflict-body"
      onClose={onClose}
      footer={
        <div className="product-dialog__actions">
          <button type="button" className="product-dialog__secondary" onClick={onClose}>
            {PRODUCT_FORM_COPY.conflict.close}
          </button>
          <button type="button" className="product-dialog__primary" onClick={onReload}>
            {PRODUCT_FORM_COPY.conflict.reload}
          </button>
        </div>
      }
    >
      <p className="product-dialog__body-text" id="product-conflict-body">
        {body ?? PRODUCT_FORM_COPY.conflict.body}
      </p>
    </ProductDialog>
  );
}

interface UnsavedDialogProps {
  readonly onLeave: () => void;
  readonly onStay: () => void;
}

/**
 * The unsaved-change confirmation (`521:284` — Rời trang khi form bẩn).
 *
 * Only ever rendered when a save would actually send something, so a form the
 * operator merely looked at never blocks their exit.
 */
export function ProductUnsavedDialog({ onLeave, onStay }: UnsavedDialogProps) {
  return (
    <ProductDialog
      title={PRODUCT_FORM_COPY.unsaved.title}
      describedBy="product-unsaved-body"
      onClose={onStay}
      footer={
        <div className="product-dialog__actions">
          <button type="button" className="product-dialog__secondary" onClick={onStay}>
            {PRODUCT_FORM_COPY.unsaved.stay}
          </button>
          <button type="button" className="product-dialog__primary" onClick={onLeave}>
            {PRODUCT_FORM_COPY.unsaved.leave}
          </button>
        </div>
      }
    >
      <p className="product-dialog__body-text" id="product-unsaved-body">
        {PRODUCT_FORM_COPY.unsaved.body}
      </p>
    </ProductDialog>
  );
}

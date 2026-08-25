'use client';

import { useId } from 'react';

import type { AdminSkuStockResponse } from '@embroidery/api-client';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { adjustmentHeading, useStockAdjustment } from '../hooks/use-stock-adjustment';
import { StockAdjustmentForm } from './stock-adjustment-form';
import { StockAdjustmentRefusalPanel, StockAdjustmentSuccess } from './stock-adjustment-outcome';
import { StockDialog } from './stock-dialog';

interface StockAdjustmentDialogProps {
  readonly skuId: string;
  /** The record the dialog opens against; the `before` of every report. */
  readonly stock: AdminSkuStockResponse;
  readonly onClose: () => void;
  /** Closes the dialog and moves focus to the history the write appended to. */
  readonly onViewLedger: () => void;
}

/**
 * The audited adjustment, start to finish (`777:3`, `777:33`, `777:60`,
 * `777:83`, `777:99`).
 *
 * One dialog, four phases, and the footer changes with them:
 *
 * - **form** — Huỷ · Áp dụng điều chỉnh.
 * - **submitting** — both buttons disabled. Dismissal is refused, including
 *   `Escape`: `777:77` requires the operator to stay until the server answers,
 *   because closing over a running write leaves them with no way to learn how
 *   it ended and inviting a second attempt is the one thing that must not
 *   happen. This is stricter than `777:79`, which draws the cancel button in
 *   its ordinary treatment; the frame's own note is what settles it.
 * - **success** — Đóng · Xem lịch sử chuyển động.
 * - **refused** — Đóng · Sửa chênh lệch, which returns to the form with the
 *   entered delta and reason intact so the operator can decide by how much to
 *   change them. Nothing is clamped for them.
 *
 * The submit button is disabled while a write is in flight and the controller
 * refuses a second `submit()` regardless, so neither a double click nor a
 * keyboard repeat can send the operation twice.
 */
export function StockAdjustmentDialog({
  skuId,
  stock,
  onClose,
  onViewLedger,
}: StockAdjustmentDialogProps) {
  const controller = useStockAdjustment({ skuId, stock });
  const contextId = useId();
  const submitting = controller.phase === 'submitting';
  const shortSku = truncateIdentifier(skuId);

  const context =
    controller.phase === 'submitting'
      ? COPY.submitting.context(shortSku)
      : controller.phase === 'success'
        ? COPY.success.context(shortSku)
        : controller.phase === 'refused' && controller.refusal?.stock != null
          ? COPY.refusal.negativeContext(shortSku, controller.refusal.stock.quantityOnHand)
          : COPY.adjust.context(shortSku, stock.quantityOnHand, stock.available);

  return (
    <StockDialog
      title={adjustmentHeading(controller.phase)}
      describedBy={contextId}
      testId="adjustment-dialog"
      onDismiss={() => {
        if (!submitting) onClose();
      }}
    >
      <p className="stock-dialog__context" id={contextId}>
        {context}
      </p>

      {controller.phase === 'success' && controller.outcome !== null ? (
        <StockAdjustmentSuccess outcome={controller.outcome} />
      ) : controller.phase === 'refused' && controller.refusal !== null ? (
        <StockAdjustmentRefusalPanel refusal={controller.refusal} />
      ) : (
        <StockAdjustmentForm controller={controller} stock={stock} submitting={submitting} />
      )}

      {submitting ? (
        <div
          className="stock-panel stock-panel--info"
          role="status"
          data-testid="adjustment-pending"
        >
          <p className="stock-panel__title">{COPY.submitting.title}</p>
          <p className="stock-panel__body">{COPY.submitting.body}</p>
        </div>
      ) : null}

      <div className="stock-dialog__footer">
        <button
          type="button"
          className="stock-dialog__secondary"
          data-testid="adjustment-close"
          disabled={submitting}
          onClick={onClose}
        >
          {controller.phase === 'form' ? COPY.adjust.cancel : COPY.adjust.close}
        </button>

        {controller.phase === 'success' ? (
          <button
            type="button"
            className="stock-dialog__primary"
            data-testid="adjustment-view-ledger"
            onClick={onViewLedger}
          >
            {COPY.success.viewLedger}
          </button>
        ) : controller.phase === 'refused' ? (
          <button
            type="button"
            className="stock-dialog__primary"
            data-testid="adjustment-edit-delta"
            onClick={controller.resumeEditing}
          >
            {COPY.refusal.editDelta}
          </button>
        ) : (
          <button
            type="button"
            className="stock-dialog__primary"
            data-testid="adjustment-submit"
            disabled={submitting}
            onClick={controller.submit}
          >
            {submitting ? COPY.adjust.submitting : COPY.adjust.submit}
          </button>
        )}
      </div>
    </StockDialog>
  );
}

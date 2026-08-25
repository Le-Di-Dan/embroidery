'use client';

import type { AdminSkuStockResponse } from '@embroidery/api-client';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import { parsedDelta } from '../model/stock-adjustment-form';
import type { StockAdjustmentController } from '../hooks/use-stock-adjustment';

interface StockAdjustmentFormProps {
  readonly controller: StockAdjustmentController;
  readonly stock: AdminSkuStockResponse;
  readonly submitting: boolean;
}

/**
 * The two fields an adjustment consists of, and nothing else (`777:8`,
 * `777:15`).
 *
 * ### Signed delta, mandatory reason — the whole command
 *
 * There is no absolute-quantity control anywhere on this form. `777:24` states
 * why in the operator's own words: an absolute value would discard whatever a
 * concurrent transaction had just committed. The reason is mandatory because
 * `GRD-023` makes it audit evidence, and a blank string is not a reason.
 *
 * ### Errors are announced with the field, not only in a summary
 *
 * `AdminTextField` wires each message through `aria-describedby` and sets
 * `aria-invalid`, so the reason a field is refused is announced when the field
 * is reached. The block below the fields explains *that* the submission was
 * stopped locally; it is not the only place the failure appears.
 *
 * ### The preview is orientation, never a rendered metric
 *
 * `777:25` asks for a "sau khi áp dụng" line and labels it as guidance. It is
 * computed here from the operator's own delta, it carries the frame's sentence
 * saying the real figure comes from the server under the row lock, and it never
 * touches the metric cards on the page behind the dialog — those stay exactly
 * as the server published them until the write comes back.
 */
export function StockAdjustmentForm({ controller, stock, submitting }: StockAdjustmentFormProps) {
  const { draft, fieldErrors, setDelta, setReason } = controller;
  const delta = parsedDelta(draft);
  const blocked = fieldErrors.delta !== undefined || fieldErrors.reason !== undefined;

  return (
    <div className="stock-dialog__form">
      <AdminTextField
        label={COPY.adjust.deltaLabel}
        value={draft.delta}
        onChange={setDelta}
        help={COPY.adjust.deltaHelp}
        {...(fieldErrors.delta === undefined ? {} : { error: fieldErrors.delta })}
        disabled={submitting}
        inputMode="numeric"
        testId="adjustment-delta"
      />
      <AdminTextField
        label={COPY.adjust.reasonLabel}
        value={draft.reason}
        onChange={setReason}
        help={COPY.adjust.reasonHelp}
        {...(fieldErrors.reason === undefined ? {} : { error: fieldErrors.reason })}
        disabled={submitting}
        testId="adjustment-reason"
      />

      {blocked ? (
        <div
          className="stock-panel stock-panel--error"
          role="alert"
          data-testid="adjustment-validation"
        >
          <p className="stock-panel__title">{COPY.validation.blockedTitle}</p>
          <p className="stock-panel__body">{COPY.validation.blockedBody}</p>
        </div>
      ) : null}

      <div className="stock-panel">
        <p className="stock-panel__title">{COPY.adjust.consequenceTitle}</p>
        <p className="stock-panel__body">{COPY.adjust.consequenceBody}</p>
      </div>

      {delta === null ? null : (
        <div className="stock-panel" data-testid="adjustment-preview">
          <p className="stock-panel__title">{COPY.adjust.previewTitle}</p>
          <p className="stock-panel__body">
            {COPY.adjust.previewBody(
              stock.quantityOnHand,
              stock.quantityOnHand + delta,
              stock.available,
              stock.available + delta,
            )}
          </p>
        </div>
      )}
    </div>
  );
}

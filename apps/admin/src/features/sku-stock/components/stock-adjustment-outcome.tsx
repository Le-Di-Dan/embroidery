'use client';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import type { StockAdjustmentRefusal, StockAdjustmentOutcome } from '../hooks/use-stock-adjustment';
import { signedQuantity } from '../model/stock-presentation';

/**
 * What the dialog says once the server has answered — or once it has become
 * clear that it will not (`777:83`, `777:99`, `777:75`).
 *
 * ### The success report is two server readings, not one plus arithmetic
 *
 * "Tồn thực tế 40 → 60" is the record as it stood before the write beside the
 * record `adminSkuStock_adjust` returned with it. Nothing here adds the delta
 * to anything: if the server applied something other than what was asked, this
 * panel says what the server did.
 *
 * ### The refusal states what was *not* written
 *
 * Every refusal sentence begins from the same fact — nothing was committed: no
 * stock change and no ledger row. `INVENTORY_STOCK_WOULD_GO_NEGATIVE` in
 * particular quotes the **re-read** on-hand figure, not the one the dialog was
 * opened with, and it names the resulting negative figure so the operator can
 * see the size of the problem. It does not shrink their delta for them.
 *
 * ### The ambiguous case is not reported as a failure
 *
 * A transport that died without a response line leaves the outcome unknown, so
 * the panel says so and points at the figures that were just re-read. It offers
 * no resend: there is no idempotency key on this operation, so a second send is
 * a second adjustment.
 */
export function StockAdjustmentSuccess({ outcome }: { readonly outcome: StockAdjustmentOutcome }) {
  return (
    <div className="stock-dialog__outcome" data-testid="adjustment-success">
      <div className="stock-panel stock-panel--success">
        <p className="stock-panel__title">{COPY.success.noteTitle}</p>
        <p className="stock-panel__body">
          {COPY.success.noteBody(
            outcome.before.quantityOnHand,
            outcome.after.quantityOnHand,
            outcome.before.available,
            outcome.after.available,
          )}
        </p>
      </div>
      <div className="stock-panel">
        <p className="stock-panel__title">{COPY.success.ledgerTitle}</p>
        <p className="stock-panel__body">{COPY.success.ledgerBody}</p>
      </div>
    </div>
  );
}

function refusalText(refusal: StockAdjustmentRefusal): { title: string; body: string } {
  switch (refusal.failure) {
    case 'negativeStock': {
      // The re-read record is the only figure worth quoting. Without it the
      // panel states the refusal without inventing an arithmetic claim.
      const onHand = refusal.stock?.quantityOnHand;
      if (onHand === undefined) {
        return { title: COPY.refusal.negativeTitle, body: COPY.refusal.overrideBody };
      }
      return {
        title: COPY.refusal.negativeTitle,
        body: COPY.refusal.negativeBody(
          onHand,
          refusal.delta,
          signedQuantity(onHand + refusal.delta),
        ),
      };
    }
    case 'missing':
      return { title: COPY.refusal.missingTitle, body: COPY.refusal.missingBody };
    case 'unauthenticated':
      return { title: COPY.refusal.unauthenticatedTitle, body: COPY.refusal.unauthenticatedBody };
    case 'forbidden':
      return { title: COPY.refusal.forbiddenTitle, body: COPY.refusal.forbiddenBody };
    case 'ambiguous':
      return { title: COPY.refusal.ambiguousTitle, body: COPY.refusal.ambiguousBody };
    case 'invalid':
    case 'server':
    default:
      return { title: COPY.refusal.serverTitle, body: COPY.refusal.serverBody };
  }
}

export function StockAdjustmentRefusalPanel({
  refusal,
}: {
  readonly refusal: StockAdjustmentRefusal;
}) {
  const text = refusalText(refusal);
  return (
    <div className="stock-dialog__outcome" data-testid="adjustment-refusal">
      <div className="stock-panel stock-panel--error" role="alert">
        <p className="stock-panel__title" data-testid="adjustment-refusal-title">
          {text.title}
        </p>
        <p className="stock-panel__body">{text.body}</p>
      </div>
      {refusal.failure === 'negativeStock' ? (
        <div className="stock-panel">
          <p className="stock-panel__title">{COPY.refusal.overrideTitle}</p>
          <p className="stock-panel__body">{COPY.refusal.overrideBody}</p>
        </div>
      ) : null}
    </div>
  );
}

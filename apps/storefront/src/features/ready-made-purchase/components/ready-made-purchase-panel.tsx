'use client';

import { useState } from 'react';

import type { PublicPriceResponse } from '@embroidery/api-client';

import { buildPurchaseContinueHref } from '../model/purchase-continue-url';
import { formatExactMoney } from '../../../shared/money/exact-money';
import type { ReadyMadePurchaseResult } from '../model/purchase-projection';
import {
  clampQuantity,
  MIN_QUANTITY,
  resolvePurchase,
  type PurchaseSelection,
} from '../model/purchase-selection';
import { READY_MADE_PURCHASE_COPY } from '../model/ready-made-purchase-copy';
import { PurchaseOptionFieldset } from './purchase-option-fieldset';
import { PurchaseQuantityStepper } from './purchase-quantity-stepper';

/**
 * The Ready-Made purchase panel — `FIG-APP12-S01-PURCHASE-*` (`904:40` desktop,
 * `905:89` tablet, `905:209` mobile, `906:143` out of stock, `906:189`
 * selection incomplete).
 *
 * ## A bounded client island
 *
 * The Product Detail page stays a Server Component and so does everything around
 * this panel: the breadcrumb, the gallery, the identity group, the story and the
 * continuation section are all server-rendered as before. Only the selection is
 * interactive, so only the selection is a client component — and even here the
 * *data* arrives as props from the route's server read, so this island issues no
 * request of its own, holds no query cache and has no loading state to flash
 * (`APP12-S01` §25, §26).
 *
 * ## No hidden state
 *
 * Everything rendered below is derived on each render by `resolvePurchase` from
 * (projection, selection). Nothing is copied into state, nothing is synchronised
 * by an effect, and a selection the server no longer offers is dropped by the
 * resolver rather than reconciled afterwards — which is what makes a refetch
 * that withdraws a SKU safe: the stale id cannot survive one render, and no
 * other SKU is silently substituted for it (`APP12-S01` §16).
 *
 * The quantity is keyed to the SKU it was typed for, so a SKU change resets it
 * to `1` without an effect and a quantity valid for one SKU can never be carried
 * onto another with less stock.
 *
 * ## Nothing here creates anything
 *
 * The panel reads. It creates no order, no reservation, no hold, no grant and no
 * payment attempt, and it does not know how to: the only outbound affordance is
 * an `href`, and `APP12-S02` owns the page it points at.
 */
export interface ReadyMadePurchasePanelProps {
  readonly slug: string;
  /**
   * The Product's own published catalog price (`publicProduct_detail.price`).
   *
   * Shown while no SKU is resolved, exactly as `906:189` and `906:143` draw it.
   * It is a server-published amount — the same `products.base_price_amount` that
   * `APP12-B01`'s `COALESCE` falls back to — not a price this component computed,
   * and the moment a SKU resolves the panel shows that SKU's resolved unit price
   * instead (`APP12-S01` §13).
   */
  readonly basePrice: PublicPriceResponse;
  readonly purchase: ReadyMadePurchaseResult;
}

export function ReadyMadePurchasePanel({ slug, basePrice, purchase }: ReadyMadePurchasePanelProps) {
  const [selection, setSelection] = useState<PurchaseSelection>({});
  // Keyed to the SKU it was typed for, so a SKU change resets the control to 1
  // without an effect and a quantity valid for one SKU can never be carried onto
  // another with less stock.
  const [typed, setTyped] = useState<{ readonly skuId: string; readonly raw: string }>();
  // The approved fieldset error belongs to a customer who has started choosing,
  // not to one who has just arrived at the page (`906:186`).
  const [engaged, setEngaged] = useState(false);

  if (purchase.kind === 'unavailable') {
    return (
      <section className="ready-made-purchase" aria-label={READY_MADE_PURCHASE_COPY.panelLabel}>
        <div className="ready-made-purchase__panel ready-made-purchase__panel--unavailable">
          <p className="ready-made-purchase__unavailable-heading">
            {READY_MADE_PURCHASE_COPY.unavailableHeading}
          </p>
          <p className="ready-made-purchase__caption">{READY_MADE_PURCHASE_COPY.unavailableBody}</p>
        </div>
      </section>
    );
  }

  const resolution = resolvePurchase(purchase.view, selection);
  const sku = resolution.sku;
  const outOfStock = resolution.state === 'OUT_OF_STOCK';

  const price = sku?.unitPrice ?? basePrice;
  const rawQuantity =
    typed !== undefined && typed.skuId === sku?.skuId ? typed.raw : String(MIN_QUANTITY);

  const select = (axis: 'color' | 'size', value: string) => {
    setEngaged(true);
    setSelection((current) => ({ ...current, [axis]: value }));
  };

  const errorFor = (axis: 'color' | 'size', message: string) =>
    engaged && resolution.missingAxis === axis ? message : undefined;

  return (
    <section className="ready-made-purchase" aria-label={READY_MADE_PURCHASE_COPY.panelLabel}>
      <div className="ready-made-purchase__panel" data-state={resolution.state}>
        <div className="ready-made-purchase__price-block">
          <p className="ready-made-purchase__price">
            {formatExactMoney(price.amount, price.currency)}
          </p>
          <p className="ready-made-purchase__caption">
            {outOfStock
              ? READY_MADE_PURCHASE_COPY.priceCaptionOutOfStock
              : READY_MADE_PURCHASE_COPY.priceCaption}
          </p>
        </div>

        {resolution.colorOptions.length === 0 ? null : (
          <PurchaseOptionFieldset
            legend={READY_MADE_PURCHASE_COPY.variantLegend}
            name="ready-made-variant"
            options={resolution.colorOptions}
            selected={resolution.selection.color}
            error={errorFor('color', READY_MADE_PURCHASE_COPY.variantRequired)}
            onSelect={(value) => {
              select('color', value);
            }}
          />
        )}

        {resolution.sizeOptions.length === 0 ? null : (
          <PurchaseOptionFieldset
            legend={READY_MADE_PURCHASE_COPY.sizeLegend}
            name="ready-made-size"
            options={resolution.sizeOptions}
            selected={resolution.selection.size}
            error={errorFor('size', READY_MADE_PURCHASE_COPY.sizeRequired)}
            onSelect={(value) => {
              select('size', value);
            }}
          />
        )}

        {sku === undefined ? null : (
          <PurchaseQuantityStepper
            rawQuantity={rawQuantity}
            availableQuantity={sku.availableQuantity}
            onChange={(raw) => {
              setEngaged(true);
              setTyped({ skuId: sku.skuId, raw });
            }}
          />
        )}

        {sku === undefined ? (
          <button type="button" className="ready-made-purchase__cta" disabled>
            {outOfStock
              ? READY_MADE_PURCHASE_COPY.continueOutOfStock
              : READY_MADE_PURCHASE_COPY.continue}
          </button>
        ) : (
          <a
            className="ready-made-purchase__cta"
            href={buildPurchaseContinueHref(
              slug,
              sku.skuId,
              clampQuantity(rawQuantity, sku.availableQuantity),
            )}
          >
            {READY_MADE_PURCHASE_COPY.continue}
          </a>
        )}
      </div>
    </section>
  );
}

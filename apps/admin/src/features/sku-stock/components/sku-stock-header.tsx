'use client';

import type { AdminSkuStockResponse } from '@embroidery/api-client';

import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import { stockPillKind } from '../model/stock-presentation';

interface SkuStockHeaderProps {
  readonly stock: AdminSkuStockResponse;
  readonly onAdjust: () => void;
}

/**
 * The SKU context card: identity, the low-stock pill, and the one action this
 * screen offers (`775:30`, `775:128`).
 *
 * ### The identity is the one the contract publishes
 *
 * `775:33` draws a SKU code (`TEE-BLK-M-001`) above the identifiers, but
 * `AdminSkuStockResponse` publishes **no** `skuCode` — only `skuId` and
 * `skuStockId` — and `APP8-A01` may not open a Catalog read to find one. The
 * card therefore shows the shortened `skuId` where the frame shows the code,
 * and both full identifiers beneath it. Inventing a code, or fetching one from
 * a second operation this checkpoint does not own, would be the alternative;
 * neither is truthful within the accepted contract. Recorded as a
 * design/contract mismatch rather than resolved by adding a capability.
 *
 * The full values ride in `title` so an operator can still read and copy them —
 * the shortening is display only and is never sent anywhere.
 *
 * ### The pill states the server's judgement or none at all
 *
 * `lowStock` compares **on-hand** with the configured threshold; holds and
 * reservations do not move it. When no threshold is configured the flag is
 * always `false`, which is the absence of an assessment rather than a healthy
 * one — so no pill is rendered, exactly as `776:3` draws it.
 */
export function SkuStockHeader({ stock, onAdjust }: SkuStockHeaderProps) {
  const pill = stockPillKind(stock);

  return (
    <section className="stock-context" data-testid="stock-context">
      <div className="stock-context__identity">
        <p className="stock-context__eyebrow">{COPY.page.skuLabel}</p>
        <p className="stock-context__sku" title={stock.skuId} data-testid="stock-sku-id">
          {truncateIdentifier(stock.skuId)}
        </p>
        <p
          className="stock-context__identifiers"
          title={COPY.page.identifiers(stock.skuId, stock.skuStockId)}
          data-testid="stock-anchor-id"
        >
          {COPY.page.identifiers(
            truncateIdentifier(stock.skuId),
            truncateIdentifier(stock.skuStockId),
          )}
        </p>
      </div>

      {pill === null ? null : (
        <AdminStatusBadge
          token={pill === 'lowStock' ? 'LOW_STOCK' : 'IN_STOCK'}
          label={pill === 'lowStock' ? COPY.pill.lowStock : COPY.pill.healthy}
          tone={pill === 'lowStock' ? 'warning' : 'success'}
          symbol={pill === 'lowStock' ? '◷' : '✓'}
          testId="stock-availability-pill"
        />
      )}

      <button
        type="button"
        className="stock-context__action"
        data-testid="open-adjustment-dialog"
        onClick={onAdjust}
      >
        {COPY.page.adjust}
      </button>
    </section>
  );
}

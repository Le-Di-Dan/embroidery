'use client';

import { useCallback, useState } from 'react';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import { classifyStockReadFailure } from '../model/sku-stock-failure';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { useSkuStockLedgerQuery, useSkuStockQuery } from '../hooks/use-sku-stock-queries';
import { LowStockNote } from './low-stock-note';
import { SkuStockFailureState } from './sku-stock-failure-state';
import { SkuStockHeader } from './sku-stock-header';
import { SkuStockMetrics } from './sku-stock-metrics';
import { SkuStockSkeleton } from './sku-stock-skeleton';
import { StockAdjustmentDialog } from './stock-adjustment-dialog';
import { StockLedgerSection } from './stock-ledger-section';

interface SkuStockScreenProps {
  readonly skuId: string;
}

const LEDGER_HEADING_ID = 'sku-stock-ledger-heading';

/**
 * `/kho/skus/{skuId}` — the Admin SKU stock workspace (`775:3`, `775:101`,
 * `776:3`, `776:54`, `776:142`, `789:3`).
 *
 * ## Two reads, one screen, and a write that believes neither
 *
 * The stock record and the ledger are separate queries because they are
 * separate operations and fail separately. The adjustment writes, then
 * *re-reads*: no metric on this page is ever produced by adding the operator's
 * delta to a number already on screen.
 *
 * ## A SKU that has never been counted is not an error and not an empty page
 *
 * `APP8-B01` creates the `sku_stocks` anchor lazily on first read, so a
 * never-counted SKU answers `200` with every quantity at zero and an empty
 * ledger. That is a successful read with a real answer, and the screen says so
 * (`776:47`) rather than showing a failure or a blank table. The distinction
 * between "zero stock" and "the read failed" comes entirely from which branch
 * the server put the response in — never from the numbers themselves.
 *
 * ## The route key authorizes nothing
 *
 * `skuId` is passed down as a plain string. All three `APP8-B01` operations
 * re-check the Admin session on every request, and a SKU id in a URL grants
 * nothing on its own.
 *
 * ## What this screen deliberately does not have
 *
 * No all-SKU stock list, no threshold editor, no absolute overwrite, no manual
 * hold or reservation action, no ledger pagination, no COP stock and no
 * production surface. Each is missing because `APP8-B01` publishes no operation
 * for it (`787:148`), not because it was forgotten.
 */
export function SkuStockScreen({ skuId }: SkuStockScreenProps) {
  const stockQuery = useSkuStockQuery(skuId);
  const ledgerQuery = useSkuStockLedgerQuery(skuId);
  const [adjusting, setAdjusting] = useState(false);

  const closeDialog = useCallback(() => {
    setAdjusting(false);
  }, []);

  const viewLedger = useCallback(() => {
    setAdjusting(false);
    // The dialog restores focus to its trigger on unmount, so the move to the
    // history has to happen after that restoration rather than racing it.
    requestAnimationFrame(() => {
      document.getElementById(LEDGER_HEADING_ID)?.focus();
    });
  }, []);

  const header = (
    <header className="stock-page__header">
      <p className="stock-page__breadcrumb">{COPY.page.breadcrumb}</p>
      <h1 className="stock-page__title">{COPY.page.title}</h1>
    </header>
  );

  if (stockQuery.isPending) {
    return (
      <div className="stock-page" data-testid="stock-page">
        {header}
        <SkuStockSkeleton />
      </div>
    );
  }

  if (stockQuery.isError) {
    return (
      <div className="stock-page" data-testid="stock-page">
        {header}
        <SkuStockFailureState
          failure={classifyStockReadFailure(stockQuery.error)}
          onRetry={() => {
            void stockQuery.refetch();
          }}
        />
      </div>
    );
  }

  const stock = stockQuery.data;
  // Server truth, not a heuristic: the anchor was created on this read and the
  // ledger — a successful, separate read — came back with no movements at all.
  const neverCounted = ledgerQuery.isSuccess && ledgerQuery.data.entries.length === 0;

  return (
    <div className="stock-page" data-testid="stock-page">
      {header}
      <p className="stock-note">
        {neverCounted ? COPY.newAnchor.lead(truncateIdentifier(skuId)) : COPY.page.source}
      </p>

      <SkuStockHeader
        stock={stock}
        onAdjust={() => {
          setAdjusting(true);
        }}
      />
      <SkuStockMetrics stock={stock} />
      <LowStockNote stock={stock} />

      <StockLedgerSection
        query={ledgerQuery}
        headingId={LEDGER_HEADING_ID}
        emptyState={
          <div className="stock-panel stock-panel--empty" data-testid="stock-never-counted">
            <p className="stock-panel__title">{COPY.newAnchor.title}</p>
            <p className="stock-panel__body">{COPY.newAnchor.body}</p>
            <button
              type="button"
              className="stock-panel__action stock-panel__action--primary"
              data-testid="open-adjustment-dialog-empty"
              onClick={() => {
                setAdjusting(true);
              }}
            >
              {COPY.page.adjust}
            </button>
          </div>
        }
      />

      {adjusting ? (
        <StockAdjustmentDialog
          skuId={skuId}
          stock={stock}
          onClose={closeDialog}
          onViewLedger={viewLedger}
        />
      ) : null}
    </div>
  );
}

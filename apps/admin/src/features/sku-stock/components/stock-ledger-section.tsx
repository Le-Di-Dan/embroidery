'use client';

import type { ReactNode } from 'react';

import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import type { SkuStockLedgerQueryResult } from '../hooks/use-sku-stock-queries';
import { StockLedgerTable } from './stock-ledger-table';

interface StockLedgerSectionProps {
  readonly query: SkuStockLedgerQueryResult;
  /** Rendered instead of the table when the SKU has never been counted. */
  readonly emptyState: ReactNode;
  readonly headingId: string;
}

/**
 * The history section and its four outcomes (`775:59`, `776:47`, `777:125`).
 *
 * The ledger is a **separate** query from the stock record, and this component
 * is where that decision pays: a history that cannot be read leaves the metrics
 * above it intact and offers its own retry, rather than turning a readable
 * stock record into a blank page. An operator who can see on-hand and
 * availability can still act.
 *
 * The truncation banner appears only when the server says `truncated === true`,
 * and disappears completely otherwise — `777:170` is explicit that an empty
 * band is not rendered. It carries no action, because there is no operation to
 * put behind one.
 */
export function StockLedgerSection({ query, emptyState, headingId }: StockLedgerSectionProps) {
  return (
    <section className="stock-ledger" aria-labelledby={headingId}>
      <div className="stock-ledger__head">
        <h2 className="stock-ledger__title" id={headingId} tabIndex={-1}>
          {COPY.ledger.title}
        </h2>
        <p className="stock-ledger__bound">{COPY.ledger.bound}</p>
      </div>

      {query.isPending ? (
        <div className="stock-skeleton__table" role="status" data-testid="stock-ledger-loading">
          <span className="stock-skeleton__label">{COPY.page.loading}</span>
          {[0, 1, 2, 3, 4].map((row) => (
            <span key={row} className="stock-skeleton__row" aria-hidden="true" />
          ))}
        </div>
      ) : query.isError ? (
        <div
          className="stock-panel stock-panel--error"
          role="alert"
          data-testid="stock-ledger-error"
        >
          <p className="stock-panel__title">{COPY.ledger.failureTitle}</p>
          <p className="stock-panel__body">{COPY.ledger.failureBody}</p>
          <button
            type="button"
            className="stock-panel__action"
            data-testid="stock-ledger-retry"
            onClick={() => {
              void query.refetch();
            }}
          >
            {COPY.ledger.retry}
          </button>
        </div>
      ) : query.data.entries.length === 0 ? (
        emptyState
      ) : (
        <>
          <StockLedgerTable entries={query.data.entries} />
          {query.data.truncated ? (
            <div
              className="stock-banner stock-banner--warning"
              data-testid="stock-ledger-truncated"
            >
              <span className="stock-banner__mark" aria-hidden="true">
                ▲
              </span>
              <div className="stock-banner__body">
                <p className="stock-banner__title">{COPY.ledger.truncatedTitle}</p>
                <p className="stock-banner__text">{COPY.ledger.truncatedBody}</p>
              </div>
            </div>
          ) : null}
          <p className="stock-note">{COPY.ledger.source}</p>
        </>
      )}
    </section>
  );
}

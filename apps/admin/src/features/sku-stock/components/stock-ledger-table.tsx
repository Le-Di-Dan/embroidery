'use client';

import type { AdminSkuStockLedgerEntryResponse } from '@embroidery/api-client';

import { formatInstant } from '../../../shared/presentation/instant';
import { SKU_STOCK_COPY as COPY } from '../model/sku-stock-copy';
import { presentOnHandDelta } from '../model/stock-presentation';

interface StockLedgerTableProps {
  readonly entries: readonly AdminSkuStockLedgerEntryResponse[];
}

/**
 * The bounded movement history (`775:63`, `777:128`).
 *
 * ### Only what the contract publishes
 *
 * Five columns, one per published field: `entryKind`, `quantity`,
 * `onHandDelta`, `reason` and `occurredAt`. The ledger carries no order, no
 * customer, no reservation holder and no operator identity — who applied an
 * adjustment lives on its audit event, not here — so no column invents one.
 *
 * ### Absent is not empty
 *
 * `reason` is mandatory on an `ADJUSTMENT` and absent on every movement that
 * carries none. An absent reason renders as `—` in the muted tone, which is the
 * frame's answer (`775:80`): a hold that was placed did not fail to record a
 * reason, it simply has none.
 *
 * ### The sign is text, never only colour
 *
 * `onHandDelta` renders as `+20`, `−25` or a bare `0`, and the tint only
 * reinforces it. A hold or reservation is `0` because the goods are still on
 * the shelf; summing this column rebuilds `quantityOnHand`, which is why it is
 * shown signed rather than as a magnitude.
 *
 * ### There is no pagination affordance, deliberately
 *
 * `adminSkuStock_ledger` accepts no cursor, page or limit and publishes only
 * `truncated`. No "load more", no page numbers and no infinite scroll appears
 * anywhere in this component — inventing one would promise a capability the
 * backend does not have (`777:169`).
 */
export function StockLedgerTable({ entries }: StockLedgerTableProps) {
  return (
    <div className="stock-table__scroll">
      <table className="stock-table" data-testid="stock-ledger-table">
        <thead>
          <tr>
            <th scope="col" className="stock-table__col--kind">
              {COPY.ledger.columns.entryKind}
            </th>
            <th scope="col" className="stock-table__col--quantity">
              {COPY.ledger.columns.quantity}
            </th>
            <th scope="col" className="stock-table__col--effect">
              {COPY.ledger.columns.onHandDelta}
            </th>
            <th scope="col" className="stock-table__col--reason">
              {COPY.ledger.columns.reason}
            </th>
            <th scope="col" className="stock-table__col--when">
              {COPY.ledger.columns.occurredAt}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const effect = presentOnHandDelta(entry.onHandDelta);
            return (
              // The contract publishes no entry id, and two movements of the
              // same kind can share a timestamp, so the index is the only
              // stable key available for a list that is never reordered.
              <tr key={`${entry.occurredAt}-${index}`} data-testid="stock-ledger-row">
                <td className="stock-table__kind">{entry.entryKind}</td>
                <td>{entry.quantity}</td>
                <td className={`stock-table__effect stock-table__effect--${effect.tone}`}>
                  {effect.label}
                </td>
                <td className={entry.reason === undefined ? 'stock-table__reason--absent' : ''}>
                  {entry.reason ?? COPY.ledger.noReason}
                </td>
                <td>
                  <time dateTime={entry.occurredAt}>{formatInstant(entry.occurredAt)}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Admin projections of one SKU's stock and of its ledger (`APP8-B01` §6).
 *
 * Runtime views, kept beside the query and the use case that build them. The
 * OpenAPI classes live in `presentation/schemas/admin-sku-stock.response.ts`:
 * keeping both in one file would make it easy to add a property to one and
 * forget the other.
 *
 * ### `available` is computed, never read from a column
 *
 * There is no `available`, no `reserved` and no `is_low_stock` column
 * (`sku_stocks` docblock, DB4 §Inventory balance). Every quantity below comes
 * from `StockAvailability`, which the delivered `StockAnchor` computes **under
 * the anchor's row lock** as `on_hand − Σ active holds − Σ active
 * reservations`. Nothing here re-sums anything.
 *
 * ### The low-stock signal is DB5's predicate, not a new rule
 *
 * `DB5_QUERY_SHAPE_CATALOG.md` Q-20 states it exactly:
 * `low_stock_threshold IS NOT NULL AND quantity_on_hand <= low_stock_threshold`.
 * It is on-hand against the threshold — **not** availability against it — so
 * holds and reservations do not move the flag, and this file does not invent a
 * second reading of a signal an accepted document already fixes.
 */
import type {
  LedgerEntry,
  SkuStock,
  StockAvailability,
} from '../../domain/repositories/sku-stock.repository';

export interface SkuStockView {
  readonly skuId: string;
  readonly skuStockId: string;
  readonly quantityOnHand: number;
  readonly heldQuantity: number;
  readonly reservedQuantity: number;
  readonly available: number;
  /** Absent when no threshold is configured for this SKU. */
  readonly lowStockThreshold: number | undefined;
  /** Q-20's predicate. `false` whenever no threshold is configured. */
  readonly lowStock: boolean;
}

export interface SkuStockLedgerEntryView {
  readonly entryKind: string;
  readonly quantity: number;
  readonly onHandDelta: number;
  readonly reason: string | undefined;
  readonly occurredAt: Date;
}

export interface SkuStockLedgerView {
  readonly skuId: string;
  readonly skuStockId: string;
  /** Newest first, capped at `LEDGER_PAGE_SIZE`. */
  readonly entries: readonly SkuStockLedgerEntryView[];
  /** True when older entries exist beyond the page. */
  readonly truncated: boolean;
}

/**
 * The published ledger page.
 *
 * `listLedger` is the delivered contract and returns a SKU's whole history, so
 * the bound is applied here rather than by adding a paging parameter to an
 * accepted port for a screen that does not exist yet. `truncated` says so
 * plainly instead of letting a capped page read as a complete one.
 */
export const LEDGER_PAGE_SIZE = 100;

export function toStockView(stock: SkuStock, availability: StockAvailability): SkuStockView {
  return {
    skuId: stock.skuId,
    skuStockId: stock.id,
    quantityOnHand: availability.quantityOnHand,
    heldQuantity: availability.heldQuantity,
    reservedQuantity: availability.reservedQuantity,
    available: availability.available,
    lowStockThreshold: stock.lowStockThreshold,
    lowStock:
      stock.lowStockThreshold !== undefined &&
      availability.quantityOnHand <= stock.lowStockThreshold,
  };
}

/**
 * The newest `LEDGER_PAGE_SIZE` entries, newest first.
 *
 * `listLedger` orders by the ledger's identity sequence ascending, which is its
 * append order, so reversing the tail is the newest-first page — no second
 * ordering rule and no timestamp comparison that could disagree with the
 * sequence the append-only table already fixes.
 */
export function toLedgerView(stock: SkuStock, entries: readonly LedgerEntry[]): SkuStockLedgerView {
  const page = entries.slice(-LEDGER_PAGE_SIZE).reverse();
  return {
    skuId: stock.skuId,
    skuStockId: stock.id,
    entries: page.map((entry) => ({
      entryKind: entry.entryKind,
      quantity: entry.quantity,
      onHandDelta: entry.onHandDelta,
      reason: entry.reason,
      occurredAt: entry.occurredAt,
    })),
    truncated: entries.length > LEDGER_PAGE_SIZE,
  };
}

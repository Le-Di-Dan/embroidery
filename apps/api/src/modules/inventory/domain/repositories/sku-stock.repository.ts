/**
 * The AGG-07 SKU Stock contract — re-exported from its shared home
 * (`APP8-B02`).
 *
 * The declaration and its Drizzle implementation moved to
 * `@embroidery/persistence` because `APP8-W01` writes the same tables from
 * `apps/worker`, which may not import `apps/api` (`PO-APP8-006`, IMP-D054). The
 * contract did not change and neither did its guards: G-DB7-26 under the anchor
 * lock, G-DB7-27 through `DEPOSIT_ELIGIBILITY_PORT`, G-DB7-28's conversion,
 * G-DB7-29's ledger append and G-DB7-30's mandatory reason are the delivered
 * ones.
 *
 * This file is a re-export and holds no logic. `SKU_STOCK_REPOSITORY` is the
 * same Symbol instance, so every B01 import here resolves exactly what it did
 * before and there is no second token to bind.
 */
export type {
  InventoryActor,
  LedgerEntry,
  Reservation,
  ReservationId,
  SkuStock,
  SkuStockId,
  SkuStockRepository,
  SoftHold,
  SoftHoldId,
  StockAvailability,
} from '@embroidery/persistence';
export { SKU_STOCK_REPOSITORY } from '@embroidery/persistence';

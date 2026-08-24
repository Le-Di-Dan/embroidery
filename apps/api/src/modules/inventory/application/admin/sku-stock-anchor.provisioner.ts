/**
 * **Gap A** — the runtime that finally creates a `sku_stocks` row
 * (`APP8-R00` §10.1, `APP8-B01` §5).
 *
 * At APP8 entry `ensureStockRow` had **zero non-test callers**: APP7's SKU
 * authoring writes `skus` and never touches stock, so `StockAnchor.requireLocked`
 * answered *"That SKU has no stock record"* for every SKU the system could
 * author, and every reservation path was unreachable for a reason that had
 * nothing to do with stock. This file is that missing caller, and it is the
 * only one.
 *
 * ### Why the anchor is created here rather than in APP7
 *
 * `sku_stocks`' own docblock says rows "are created by admin stock
 * initialisation, **not lazily on the order path**" — and this is exactly the
 * Admin path, not the order path. `APP8-B01` §5 prefers lazy, inventory-owned
 * creation over reopening the closed APP7 authoring flow, and inventory owning
 * its own anchor is what keeps Catalog from having to know that a stock model
 * exists at all.
 *
 * ### It is idempotent because the database makes it so
 *
 * `uq_sku_stocks__sku` (CST-014) permits exactly one row per SKU, and
 * `ensureStockRow` inserts `ON CONFLICT DO NOTHING` and then reads. Two
 * concurrent operators on the same SKU therefore produce one row: the loser
 * blocks on the unique index, finds no inserted row, and re-reads the winner's
 * committed one. Nothing here counts, retries or coordinates.
 *
 * ### Zero is the repository's initial value, not a business default
 *
 * `ensureStockRow(id, skuId, quantityOnHand)` takes the initial quantity from
 * its caller and this passes `0`. That is not an invented policy: an anchor
 * that has never been adjusted describes a SKU with nothing on hand, and any
 * other opening figure would be stock nobody counted. The first real quantity
 * arrives through the audited adjustment, which is the only operation in this
 * checkpoint that may move `quantity_on_hand`.
 *
 * ### The FK is the authority on whether the SKU exists
 *
 * There is no `skus` read here and no Catalog port in this module's injector.
 * `fk_sku_stocks__sku_id` (REL-026) already decides the question, so the insert
 * is attempted and its rejection is translated. A second existence check in the
 * application could disagree with the constraint it imitates; this one cannot.
 *
 * `RECORD_NOT_FOUND` is deliberately **not** translated: that is
 * `ensureStockRow`'s own "the insert conflicted but the row could not be read"
 * branch, which means the unique index and the table disagree. It travels on as
 * a fault rather than being dressed up as an ordinary missing SKU.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';

import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import { stockOperationError } from '../../domain/stock-operations.errors';
import {
  SKU_STOCK_REPOSITORY,
  type SkuStock,
  type SkuStockId,
  type SkuStockRepository,
} from '../../domain/repositories/sku-stock.repository';

/** The driver code `fk_sku_stocks__sku_id` produces through `mapDatabaseError`. */
const REFERENCE_NOT_FOUND = 'REFERENCE_NOT_FOUND';

@Injectable()
export class SkuStockAnchorProvisioner {
  constructor(@Inject(SKU_STOCK_REPOSITORY) private readonly stocks: SkuStockRepository) {}

  /**
   * The SKU's stock anchor, created on first use.
   *
   * @requiresTransaction — the anchor and whatever the caller does with it must
   * commit or roll back together, or a refused adjustment would leave a stock
   * row behind for a SKU nobody successfully counted.
   */
  async ensure(skuId: SkuId): Promise<SkuStock> {
    try {
      return await this.stocks.ensureStockRow(newId() as SkuStockId, skuId, 0);
    } catch (error: unknown) {
      if (isPersistenceError(error) && error.code === REFERENCE_NOT_FOUND) {
        throw stockOperationError('SKU_NOT_FOUND');
      }
      throw error;
    }
  }
}

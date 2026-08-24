/**
 * Operation A — one SKU's stock state, as an operator is entitled to see it
 * (`APP8-B01` §6).
 *
 * ### It runs in a transaction, and that is not incidental
 *
 * `SkuStockRepository.availability` takes the `sku_stocks` row lock before it
 * sums holds and reservations (GRD-014): the figure it returns is a *decision*
 * figure, not a sample. Reading it outside the lock would let this response
 * report an availability that a concurrent reservation had already spent, which
 * is precisely the arithmetic `APP8-B01` §4.1 forbids duplicating in a looser
 * form. The read joins the same transaction as the anchor it may create, so a
 * SKU either gains its anchor and is reported, or neither happens.
 *
 * At the locked scale — one row per SKU, dozens of SKUs (`DB5_ACCESS_PATH_MATRIX`
 * Q-20/Q-32) — the cost of that lock is a single indexed row touch, and the
 * alternative is a number nobody can act on.
 *
 * ### Nothing customer-owned is reachable from here
 *
 * The response carries quantities and one SKU id. There is no order, no
 * customer, no reservation holder, no hold subject and no request: the view is
 * built from `SkuStock` and `StockAvailability`, and neither carries them.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import {
  SKU_STOCK_REPOSITORY,
  type SkuStockRepository,
} from '../../domain/repositories/sku-stock.repository';
import { SkuStockAnchorProvisioner } from './sku-stock-anchor.provisioner';
import { toStockView, type SkuStockView } from './sku-stock.view';

@Injectable()
export class ReadSkuStockQuery {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly anchors: SkuStockAnchorProvisioner,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stocks: SkuStockRepository,
  ) {}

  async read(skuId: string): Promise<SkuStockView> {
    return this.transactions.runInTransaction(async () => {
      const stock = await this.anchors.ensure(skuId as SkuId);
      const availability = await this.stocks.availability(skuId as SkuId);
      if (availability === undefined) {
        // Unreachable: `ensure` committed the anchor in this transaction, so
        // the locked read that follows it cannot miss. Left as a fault rather
        // than a refusal — a missing row here would mean the anchor vanished
        // mid-transaction, which is not something to answer with a 404.
        throw new Error(`The stock anchor for SKU ${skuId} disappeared inside its transaction.`);
      }
      return toStockView(stock, availability);
    });
  }
}

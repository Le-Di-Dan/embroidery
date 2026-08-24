/**
 * Operation C — the movement history behind one SKU's stock (`APP8-B01` §6).
 *
 * ### Why the ledger, and not an availability list
 *
 * `APP8-B01` §6 asks for the smallest third operation the accepted Admin
 * inventory screen needs, chosen from repository truth. `listLedger` is a
 * **delivered** contract with no HTTP consumer, and `inventory_ledger_entries`
 * is the rebuild source of truth (INV-14) that explains every change to
 * `quantity_on_hand`. Publishing it costs no new persistence code and answers
 * the operator's real question after an adjustment — *what happened to this
 * stock, and why*. An availability list across all SKUs would need a query the
 * accepted port does not have, invented before `APP8-A01` exists to say what it
 * must contain; §6 forbids exactly that.
 *
 * ### What each entry does not carry
 *
 * No actor, no order, no reservation, no hold and no customer. `LedgerEntry` is
 * the delivered projection and carries none of them, and this checkpoint does
 * not widen it to publish an order id on an Inventory screen. The operator
 * identity behind an adjustment lives on its `audit_events` row, which is where
 * `DB3_AUDIT_SPECIFICATION.md` puts it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import {
  SKU_STOCK_REPOSITORY,
  type SkuStockRepository,
} from '../../domain/repositories/sku-stock.repository';
import { SkuStockAnchorProvisioner } from './sku-stock-anchor.provisioner';
import { toLedgerView, type SkuStockLedgerView } from './sku-stock.view';

@Injectable()
export class ReadSkuStockLedgerQuery {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly anchors: SkuStockAnchorProvisioner,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stocks: SkuStockRepository,
  ) {}

  async read(skuId: string): Promise<SkuStockLedgerView> {
    return this.transactions.runInTransaction(async () => {
      // The same anchor path as the stock read, for the same reason: a SKU that
      // has never been counted has an empty history, and a SKU that does not
      // exist is a 404. Only the FK can tell those apart.
      const stock = await this.anchors.ensure(skuId as SkuId);
      const entries = await this.stocks.listLedger(skuId as SkuId);
      return toLedgerView(stock, entries);
    });
  }
}

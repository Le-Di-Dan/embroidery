/**
 * Operation B — the audited stock adjustment (`APP8-B01` §4.3, GRD-023).
 *
 * The only operation in this checkpoint that may move `quantity_on_hand`, and
 * the only way a SKU ever acquires stock: there is no set-absolute operation,
 * because the delivered repository authority is delta-based and an absolute
 * write would silently discard whatever a concurrent transaction had just
 * committed.
 *
 * ### One transaction, one anchor lock, one ledger row
 *
 * ```text
 * anchor  -> ensured (Gap A) if this SKU has never been counted
 * lock    -> sku_stocks FOR UPDATE (GRD-014) — the guard decides under it
 * stock   -> quantity_on_hand + delta
 * ledger  -> exactly one ADJUSTMENT entry, with the operator's reason
 * audit   -> one sku_stock.adjusted row, qty before/after + reason
 * ```
 *
 * Every one of those writes joins the same transaction, so a refusal at any
 * point leaves none of them — which is what makes "a failed adjustment appends
 * no ledger row" a property of the boundary rather than of ordering.
 *
 * ### The negative-stock guard sits under the lock, before the write
 *
 * `ck_sku_stocks__quantity_non_negative` (CST-061 / INV-18) already makes
 * negative on-hand unrepresentable and remains the backstop. It is not a
 * sufficient *answer*, though: a CHECK violation reaches the operator as a
 * sanitised constraint failure that does not say what they asked for. So the
 * decision is taken here from the locked row — the same row `adjust` then
 * updates, in the same transaction, so no concurrent adjustment can slip
 * between the check and the write. DB3 LC-17 is explicit that the GRD-023
 * override covers adjustments **and never negative stock**.
 *
 * ### `APP8-B01` §10 — no reservation concurrency is touched
 *
 * This path takes exactly one lock, on `sku_stocks`, which is the accepted
 * anchor and the existing lock order. No reservation row is read or locked, no
 * isolation level is raised, and the missing DB3 CC-21 release-vs-consume lock
 * is left exactly where `APP8-B02` owns it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import { stockOperationError } from '../../domain/stock-operations.errors';
import {
  SKU_STOCK_REPOSITORY,
  type SkuStockRepository,
} from '../../domain/repositories/sku-stock.repository';
import { requireInventoryAdminActorId } from './inventory-admin-actor';
import { SkuStockAnchorProvisioner } from './sku-stock-anchor.provisioner';
import { StockAdjustmentRecorder } from './stock-adjustment.recorder';
import { toStockView, type SkuStockView } from './sku-stock.view';

/**
 * Everything the operator owns.
 *
 * No `adminId`, no `quantityOnHand`, no `skuStockId`, no timestamp and no entry
 * kind: the identity is bound by the guard, the resulting quantity is derived
 * from the locked row, the anchor is resolved from the SKU, and `ADJUSTMENT` is
 * fixed by the operation.
 */
export interface AdjustSkuStockCommand {
  readonly skuId: string;
  /** Signed, non-zero whole units. The request pipe has already refused `0`. */
  readonly delta: number;
  /** Mandatory (GRD-023 / CST-071). Already trimmed and non-empty. */
  readonly reason: string;
}

@Injectable()
export class AdjustSkuStockUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly anchors: SkuStockAnchorProvisioner,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stocks: SkuStockRepository,
    private readonly recorder: StockAdjustmentRecorder,
    private readonly requestContext: RequestContextService,
  ) {}

  async adjust(command: AdjustSkuStockCommand): Promise<SkuStockView> {
    const adminId = requireInventoryAdminActorId(this.requestContext);
    const skuId = command.skuId as SkuId;

    return this.transactions.runInTransaction(async () => {
      await this.anchors.ensure(skuId);

      const locked = await this.stocks.loadForUpdate(skuId);
      if (locked === undefined) {
        // Unreachable for the same reason the read's guard is: the anchor was
        // ensured in this transaction. A fault, not a refusal.
        throw new Error(`The stock anchor for SKU ${command.skuId} disappeared mid-transaction.`);
      }

      if (locked.quantityOnHand + command.delta < 0) {
        throw stockOperationError('STOCK_WOULD_GO_NEGATIVE');
      }

      const adjusted = await this.stocks.adjust(skuId, command.delta, command.reason, {
        kind: 'ADMIN',
        adminId,
      });

      await this.recorder.recordAdjusted(
        {
          skuStockId: adjusted.id,
          skuId: adjusted.skuId,
          delta: command.delta,
          quantityOnHandBefore: locked.quantityOnHand,
          quantityOnHandAfter: adjusted.quantityOnHand,
        },
        adminId,
        command.reason,
      );

      const availability = await this.stocks.availability(skuId);
      if (availability === undefined) {
        throw new Error(`The stock anchor for SKU ${command.skuId} disappeared mid-transaction.`);
      }
      return toStockView(adjusted, availability);
    });
  }
}

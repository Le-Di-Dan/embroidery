/**
 * The `sku_stocks` lock anchor and the availability computation (GRD-014).
 *
 * Split from the repository by responsibility: this is the *arithmetic* of
 * stock — locking the anchor, summing active holds and reservations, deciding
 * whether a quantity is available — while the repository owns the commands
 * that act on that decision.
 *
 * `available = on_hand − Σ active holds − Σ active reservations` is computed
 * rather than stored (DB4 §Inventory balance): a denormalised counter would
 * need its own invariant, and the ledger is the rebuild source of truth
 * (INV-14).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import type { DatabaseExecutorHandle } from '@embroidery/persistence';
import { and, eq, sum } from 'drizzle-orm';

import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type {
  SkuStock,
  SkuStockId,
  StockAvailability,
} from '../../domain/repositories/sku-stock.repository';

const { skuStocks, inventorySoftHolds, inventoryReservations } = schema;

type StockRow = typeof skuStocks.$inferSelect;

export function toStock(row: StockRow): SkuStock {
  return {
    id: row.id as SkuStockId,
    skuId: row.skuId as SkuId,
    quantityOnHand: row.quantityOnHand,
    lowStockThreshold: row.lowStockThreshold ?? undefined,
  };
}

@Injectable()
export class StockAnchor extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Takes the anchor's row lock.
   *
   * Every decision about one SKU passes through here, so they serialise behind
   * the same row rather than racing on independent reads.
   *
   * @requiresTransaction
   */
  async loadForUpdate(skuId: SkuId): Promise<SkuStock | undefined> {
    return this.run('loadForUpdate', async () => {
      const tx = this.requireTransaction('loadForUpdate');
      const [row] = await tx
        .select()
        .from(skuStocks)
        .where(eq(skuStocks.skuId, skuId))
        .limit(1)
        .for('update');
      return row === undefined ? undefined : toStock(row);
    });
  }

  /** Loads without locking. Read paths only. */
  async load(executor: DatabaseExecutorHandle, skuId: SkuId): Promise<SkuStock | undefined> {
    const [row] = await executor
      .select()
      .from(skuStocks)
      .where(eq(skuStocks.skuId, skuId))
      .limit(1);
    return row === undefined ? undefined : toStock(row);
  }

  /** The anchor under lock, or a clear failure. @requiresTransaction */
  async requireLocked(skuId: SkuId, operation: string): Promise<SkuStock> {
    const stock = await this.loadForUpdate(skuId);
    if (stock === undefined) {
      throw notFoundError(`SkuStockRepository.${operation}`, 'That SKU has no stock record.');
    }
    return stock;
  }

  async availability(stock: SkuStock): Promise<StockAvailability> {
    const [held] = await this.db
      .select({ total: sum(inventorySoftHolds.quantity) })
      .from(inventorySoftHolds)
      .where(
        and(eq(inventorySoftHolds.skuStockId, stock.id), eq(inventorySoftHolds.status, 'HELD')),
      );

    const [reserved] = await this.db
      .select({ total: sum(inventoryReservations.quantity) })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.skuStockId, stock.id),
          eq(inventoryReservations.status, 'RESERVED'),
        ),
      );

    const heldQuantity = Number(held?.total ?? 0);
    const reservedQuantity = Number(reserved?.total ?? 0);

    return {
      quantityOnHand: stock.quantityOnHand,
      heldQuantity,
      reservedQuantity,
      available: stock.quantityOnHand - heldQuantity - reservedQuantity,
    };
  }

  /**
   * **G-DB7-26 / GRD-014** — the availability decision, made under the lock.
   *
   * Single-run only. Two callers each taking the lock in turn both see a
   * correct figure; proving no oversubscription under concurrent load is
   * DB8 CC-20 and is not claimed here.
   */
  async assertSufficient(stock: SkuStock, quantity: number, operation: string): Promise<void> {
    if (quantity <= 0) {
      throw guardViolationError(
        `SkuStockRepository.${operation}`,
        'QUANTITY_INVALID',
        'The quantity must be positive.',
      );
    }

    const availability = await this.availability(stock);
    if (availability.available < quantity) {
      throw guardViolationError(
        `SkuStockRepository.${operation}`,
        'INSUFFICIENT_STOCK',
        'There is not enough stock available for that quantity.',
      );
    }
  }
}

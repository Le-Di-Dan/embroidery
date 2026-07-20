/**
 * Soft holds — the provisional claim made against stock before an order
 * exists (TBL-020).
 *
 * Split from `DrizzleSkuStockRepository` by responsibility: this is the
 * lifecycle of a *claim* on stock, while the repository owns the stock record
 * and the ledger. Reservations (TBL-021) are `InventoryReservations`, a
 * sibling split for the same reason — together both still serve the single
 * `SkuStockRepository` contract, so neither table gains a repository of its
 * own (DB7 §10.1).
 *
 * Carries **G-DB7-26** (via `StockAnchor`) and **G-DB7-29** (every
 * commitment appends its ledger entry).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { InventorySoftHoldState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type {
  InventoryActor,
  SkuStockId,
  SoftHold,
  SoftHoldId,
} from '../../domain/repositories/sku-stock.repository';
import { StockAnchor } from './stock-anchor';

const { inventoryLedgerEntries, inventorySoftHolds } = schema;

type HoldRow = typeof inventorySoftHolds.$inferSelect;

export function toHold(row: HoldRow): SoftHold {
  return {
    id: row.id as SoftHoldId,
    skuStockId: row.skuStockId as SkuStockId,
    customRequestId: row.customRequestId,
    quantity: row.quantity,
    status: row.status as InventorySoftHoldState,
    expiresAt: row.expiresAt,
  };
}

export function actorColumns(actor: InventoryActor) {
  return actor.kind === 'ADMIN'
    ? { actorKind: 'ADMIN', adminId: actor.adminId }
    : { actorKind: 'SYSTEM', systemJobKey: actor.systemJobKey };
}

@Injectable()
export class InventoryCommitments extends DrizzleRepository {
  constructor(
    executor: DatabaseExecutor,
    private readonly anchor: StockAnchor,
  ) {
    super(executor);
  }

  async createSoftHold(input: {
    id: SoftHoldId;
    skuId: SkuId;
    customRequestId: string;
    quantity: number;
    expiresAt: Date;
    actor: InventoryActor;
  }): Promise<SoftHold> {
    return this.run('createSoftHold', async () => {
      const tx = this.requireTransaction('createSoftHold');
      const stock = await this.anchor.requireLocked(input.skuId, 'createSoftHold');
      await this.anchor.assertSufficient(stock, input.quantity, 'createSoftHold');

      const [row] = await tx
        .insert(inventorySoftHolds)
        .values({
          id: input.id,
          skuStockId: stock.id,
          customRequestId: input.customRequestId,
          quantity: input.quantity,
          status: 'HELD',
          expiresAt: input.expiresAt,
        })
        .returning();

      await tx.insert(inventoryLedgerEntries).values({
        skuStockId: stock.id,
        entryKind: 'HOLD_PLACED',
        quantity: input.quantity,
        // A hold reduces *availability*, not on-hand: the goods are still there.
        onHandDelta: 0,
        softHoldId: input.id,
        ...actorColumns(input.actor),
      });

      if (row === undefined) {
        throw guardViolationError(
          'SkuStockRepository.createSoftHold',
          'HOLD_NOT_CREATED',
          'Could not place the hold.',
        );
      }
      return toHold(row);
    });
  }

  async releaseSoftHold(id: SoftHoldId, reason: string, actor: InventoryActor): Promise<void> {
    return this.run('releaseSoftHold', async () => {
      const tx = this.requireTransaction('releaseSoftHold');
      const hold = await this.requireHeldHold(id, 'releaseSoftHold');

      await tx
        .update(inventorySoftHolds)
        .set({ status: 'RELEASED', releasedReason: reason, updatedAt: new Date() })
        .where(eq(inventorySoftHolds.id, id));

      await tx.insert(inventoryLedgerEntries).values({
        skuStockId: hold.skuStockId,
        entryKind: 'HOLD_RELEASED',
        quantity: hold.quantity,
        onHandDelta: 0,
        softHoldId: id,
        reason,
        ...actorColumns(actor),
      });
    });
  }

  async findHold(id: SoftHoldId): Promise<SoftHold | undefined> {
    return this.run('findHold', async () => {
      const [row] = await this.db
        .select()
        .from(inventorySoftHolds)
        .where(eq(inventorySoftHolds.id, id))
        .limit(1);
      return row === undefined ? undefined : toHold(row);
    });
  }

  /**
   * Loads a hold and asserts it is still HELD — the precondition every
   * lifecycle move off a hold shares, including `InventoryReservations`'
   * conversion path.
   */
  async requireHeldHold(id: SoftHoldId, operation: string): Promise<SoftHold> {
    const hold = await this.findHold(id);
    if (hold === undefined) {
      throw notFoundError(`SkuStockRepository.${operation}`, 'That hold does not exist.');
    }
    if (hold.status !== 'HELD') {
      throw guardViolationError(
        `SkuStockRepository.${operation}`,
        'HOLD_NOT_ACTIVE',
        'That hold is no longer active.',
      );
    }
    return hold;
  }
}

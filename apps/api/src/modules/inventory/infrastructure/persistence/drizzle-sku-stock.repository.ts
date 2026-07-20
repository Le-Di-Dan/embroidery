/**
 * Drizzle implementation of the AGG-07 SKU Stock contract
 * (TBL-018..TBL-021).
 *
 * Every mutating method takes the `sku_stocks` row lock first, so decisions
 * about one SKU serialise behind the same anchor (GRD-014).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { InventoryEntryKind } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { asc, eq } from 'drizzle-orm';

import type { SkuId } from '../../../catalog/domain/repositories/placement-hierarchy.port';
import { InventoryCommitments, actorColumns } from './inventory-commitments';
import { StockAnchor, toStock } from './stock-anchor';
import type {
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
} from '../../domain/repositories/sku-stock.repository';

const { skuStocks, inventoryLedgerEntries } = schema;

@Injectable()
export class DrizzleSkuStockRepository extends DrizzleRepository implements SkuStockRepository {
  constructor(
    executor: DatabaseExecutor,
    private readonly anchor: StockAnchor,
    private readonly commitments: InventoryCommitments,
  ) {
    super(executor);
  }

  async ensureStockRow(id: SkuStockId, skuId: SkuId, quantityOnHand: number): Promise<SkuStock> {
    return this.run('ensureStockRow', async () => {
      const tx = this.requireTransaction('ensureStockRow');

      const [inserted] = await tx
        .insert(skuStocks)
        .values({ id, skuId, quantityOnHand })
        .onConflictDoNothing({ target: skuStocks.skuId })
        .returning();

      if (inserted !== undefined) {
        return toStock(inserted);
      }

      const existing = await this.anchor.load(tx, skuId);
      if (existing === undefined) {
        throw notFoundError(
          'SkuStockRepository.ensureStockRow',
          'That stock record could not be read.',
        );
      }
      return existing;
    });
  }

  loadForUpdate(skuId: SkuId): Promise<SkuStock | undefined> {
    return this.anchor.loadForUpdate(skuId);
  }

  async availability(skuId: SkuId): Promise<StockAvailability | undefined> {
    return this.run('availability', async () => {
      const stock = await this.anchor.loadForUpdate(skuId);
      return stock === undefined ? undefined : this.anchor.availability(stock);
    });
  }

  async adjust(
    skuId: SkuId,
    delta: number,
    reason: string,
    actor: InventoryActor,
  ): Promise<SkuStock> {
    return this.run('adjust', async () => {
      const tx = this.requireTransaction('adjust');

      // G-DB7-30 / GRD-023. `ck_inventory_ledger_entries__adjustment_has_reason`
      // tests NOT NULL; the blank case is the application's. Stock that changed
      // for no recorded reason cannot be reconciled against the ledger.
      if (reason.trim() === '') {
        throw guardViolationError(
          'SkuStockRepository.adjust',
          'ADJUSTMENT_REASON_REQUIRED',
          'A reason is required to adjust stock.',
        );
      }
      if (delta === 0) {
        throw guardViolationError(
          'SkuStockRepository.adjust',
          'ADJUSTMENT_EMPTY',
          'A stock adjustment must change the quantity.',
        );
      }

      const stock = await this.anchor.requireLocked(skuId, 'adjust');

      const [row] = await tx
        .update(skuStocks)
        .set({ quantityOnHand: stock.quantityOnHand + delta, updatedAt: new Date() })
        .where(eq(skuStocks.id, stock.id))
        .returning();

      // G-DB7-29: the balance change and its ledger entry are one write. The
      // ledger is the rebuild source of truth (INV-14), so a movement it does
      // not record is a balance nobody can explain.
      await tx.insert(inventoryLedgerEntries).values({
        skuStockId: stock.id,
        entryKind: 'ADJUSTMENT',
        quantity: Math.abs(delta),
        onHandDelta: delta,
        reason,
        ...actorColumns(actor),
      });

      if (row === undefined) {
        throw notFoundError('SkuStockRepository.adjust', 'That stock record does not exist.');
      }
      return toStock(row);
    });
  }

  // Commitments against stock are a separate responsibility, implemented in
  // `InventoryCommitments` and delegated to here so the aggregate still
  // presents one `SkuStockRepository` contract (DB7 §10.1).

  createSoftHold(input: Parameters<InventoryCommitments['createSoftHold']>[0]): Promise<SoftHold> {
    return this.commitments.createSoftHold(input);
  }

  releaseSoftHold(id: SoftHoldId, reason: string, actor: InventoryActor): Promise<void> {
    return this.commitments.releaseSoftHold(id, reason, actor);
  }

  convertHold(input: Parameters<InventoryCommitments['convertHold']>[0]): Promise<Reservation> {
    return this.commitments.convertHold(input);
  }

  createReservation(
    input: Parameters<InventoryCommitments['createReservation']>[0],
  ): Promise<Reservation> {
    return this.commitments.createReservation(input);
  }

  releaseReservation(id: ReservationId, reason: string, actor: InventoryActor): Promise<void> {
    return this.commitments.releaseReservation(id, reason, actor);
  }

  consumeReservation(id: ReservationId, actor: InventoryActor): Promise<void> {
    return this.commitments.consumeReservation(id, actor);
  }

  findHold(id: SoftHoldId): Promise<SoftHold | undefined> {
    return this.commitments.findHold(id);
  }

  findReservation(id: ReservationId): Promise<Reservation | undefined> {
    return this.commitments.findReservation(id);
  }

  async findBySku(skuId: SkuId): Promise<SkuStock | undefined> {
    return this.run('findBySku', () => this.anchor.load(this.db, skuId));
  }

  async listLedger(skuId: SkuId): Promise<LedgerEntry[]> {
    return this.run('listLedger', async () => {
      const stock = await this.anchor.load(this.db, skuId);
      if (stock === undefined) {
        return [];
      }
      const rows = await this.db
        .select()
        .from(inventoryLedgerEntries)
        .where(eq(inventoryLedgerEntries.skuStockId, stock.id))
        .orderBy(asc(inventoryLedgerEntries.id));

      return rows.map((row) => ({
        entryKind: row.entryKind as InventoryEntryKind,
        quantity: row.quantity,
        onHandDelta: row.onHandDelta,
        reason: row.reason ?? undefined,
      }));
    });
  }
}

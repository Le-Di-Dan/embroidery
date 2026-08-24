/**
 * Reservations — the official commitment made against stock once an order
 * exists (TBL-021).
 *
 * Split from `DrizzleSkuStockRepository` by responsibility, sibling to
 * `InventoryCommitments` (soft holds) for the same reason — together both
 * still serve the single `SkuStockRepository` contract (DB7 §10.1).
 *
 * Carries **G-DB7-26** (via `StockAnchor`), **G-DB7-27** (via
 * `ReservationEligibilityGuard`), **G-DB7-28** (hold → reservation
 * conversion) and **G-DB7-29** (every commitment appends its ledger entry).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type {
  InventoryEntryKind,
  InventoryReservationState,
  Transaction,
} from '@embroidery/database';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { DatabaseExecutor } from '../runtime/database-executor';
import { eq } from 'drizzle-orm';

import type { SkuId } from './inventory-identity';
import type {
  InventoryActor,
  Reservation,
  ReservationId,
  SkuStockId,
  SoftHoldId,
} from './sku-stock.repository';
import { actorColumns, InventoryCommitments } from './inventory-commitments';
import { ReservationEligibilityGuard } from './reservation-eligibility.guard';
import { StockAnchor } from './stock-anchor';

const { skuStocks, inventoryLedgerEntries, inventorySoftHolds, inventoryReservations } = schema;

type ReservationRow = typeof inventoryReservations.$inferSelect;

export function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id as ReservationId,
    skuStockId: row.skuStockId as SkuStockId,
    orderId: row.orderId,
    quantity: row.quantity,
    status: row.status as InventoryReservationState,
  };
}

@Injectable()
export class InventoryReservations extends DrizzleRepository {
  constructor(
    executor: DatabaseExecutor,
    private readonly anchor: StockAnchor,
    private readonly eligibility: ReservationEligibilityGuard,
    private readonly holds: InventoryCommitments,
  ) {
    super(executor);
  }

  async convertHold(input: {
    holdId: SoftHoldId;
    reservationId: ReservationId;
    orderId: string;
    actor: InventoryActor;
  }): Promise<Reservation> {
    return this.run('convertHold', async () => {
      const tx = this.requireTransaction('convertHold');
      const hold = await this.holds.requireHeldHold(input.holdId, 'convertHold');

      // G-DB7-27/GRD-013: the order's deposit must be SATISFIED before a
      // hold converts into an official commitment against it.
      await this.eligibility.assertEligible(input.orderId, 'convertHold');

      // Lock the anchor before converting, so this serialises with any other
      // decision about the same SKU.
      await tx
        .select({ id: skuStocks.id })
        .from(skuStocks)
        .where(eq(skuStocks.id, hold.skuStockId))
        .limit(1)
        .for('update');

      const [reservation] = await tx
        .insert(inventoryReservations)
        .values({
          id: input.reservationId,
          skuStockId: hold.skuStockId,
          orderId: input.orderId,
          quantity: hold.quantity,
          status: 'RESERVED',
        })
        .returning();

      await tx
        .update(inventorySoftHolds)
        .set({
          status: 'CONVERTED',
          convertedReservationId: input.reservationId,
          updatedAt: new Date(),
        })
        .where(eq(inventorySoftHolds.id, input.holdId));

      // Two entries, one transaction: the hold ends and the reservation begins
      // together, so the ledger never shows a quantity held by nothing.
      await tx.insert(inventoryLedgerEntries).values([
        {
          skuStockId: hold.skuStockId,
          entryKind: 'HOLD_CONVERTED' as InventoryEntryKind,
          quantity: hold.quantity,
          onHandDelta: 0,
          softHoldId: input.holdId,
          ...actorColumns(input.actor),
        },
        {
          skuStockId: hold.skuStockId,
          entryKind: 'RESERVED' as InventoryEntryKind,
          quantity: hold.quantity,
          onHandDelta: 0,
          reservationId: input.reservationId,
          orderId: input.orderId,
          ...actorColumns(input.actor),
        },
      ]);

      if (reservation === undefined) {
        throw guardViolationError(
          'SkuStockRepository.convertHold',
          'RESERVATION_NOT_CREATED',
          'Could not create the reservation.',
        );
      }
      return toReservation(reservation);
    });
  }

  async createReservation(input: {
    id: ReservationId;
    skuId: SkuId;
    orderId: string;
    quantity: number;
    actor: InventoryActor;
  }): Promise<Reservation> {
    return this.run('createReservation', async () => {
      const tx = this.requireTransaction('createReservation');
      // G-DB7-27/GRD-013 — same gate as `convertHold`.
      await this.eligibility.assertEligible(input.orderId, 'createReservation');
      const stock = await this.anchor.requireLocked(input.skuId, 'createReservation');
      await this.anchor.assertSufficient(stock, input.quantity, 'createReservation');

      const [row] = await tx
        .insert(inventoryReservations)
        .values({
          id: input.id,
          skuStockId: stock.id,
          orderId: input.orderId,
          quantity: input.quantity,
          status: 'RESERVED',
        })
        .returning();

      await tx.insert(inventoryLedgerEntries).values({
        skuStockId: stock.id,
        entryKind: 'RESERVED',
        quantity: input.quantity,
        onHandDelta: 0,
        reservationId: input.id,
        orderId: input.orderId,
        ...actorColumns(input.actor),
      });

      if (row === undefined) {
        throw guardViolationError(
          'SkuStockRepository.createReservation',
          'RESERVATION_NOT_CREATED',
          'Could not create the reservation.',
        );
      }
      return toReservation(row);
    });
  }

  async releaseReservation(
    id: ReservationId,
    reason: string,
    actor: InventoryActor,
  ): Promise<void> {
    return this.run('releaseReservation', async () => {
      const tx = this.requireTransaction('releaseReservation');
      // CC-21. The lock, then the decision — in that order, in this transaction.
      const reservation = await this.lockReservedReservation(tx, id, 'releaseReservation');

      await tx
        .update(inventoryReservations)
        .set({
          status: 'RELEASED',
          releasedReason: reason,
          terminalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventoryReservations.id, id));

      await tx.insert(inventoryLedgerEntries).values({
        skuStockId: reservation.skuStockId,
        entryKind: 'RESERVATION_RELEASED',
        quantity: reservation.quantity,
        onHandDelta: 0,
        reservationId: id,
        reason,
        ...actorColumns(actor),
      });
    });
  }

  async consumeReservation(id: ReservationId, actor: InventoryActor): Promise<void> {
    return this.run('consumeReservation', async () => {
      const tx = this.requireTransaction('consumeReservation');
      // CC-21. Before the anchor: a reservation may only be terminalized once,
      // and only the holder of its row lock may decide that.
      const reservation = await this.lockReservedReservation(tx, id, 'consumeReservation');

      const [stock] = await tx
        .select()
        .from(skuStocks)
        .where(eq(skuStocks.id, reservation.skuStockId))
        .limit(1)
        .for('update');

      if (stock === undefined) {
        throw notFoundError(
          'SkuStockRepository.consumeReservation',
          'That stock record does not exist.',
        );
      }

      await tx
        .update(inventoryReservations)
        .set({ status: 'CONSUMED', terminalizedAt: new Date(), updatedAt: new Date() })
        .where(eq(inventoryReservations.id, id));

      // Consumption is the only path that reduces on-hand: the goods have
      // physically left.
      await tx
        .update(skuStocks)
        .set({
          quantityOnHand: stock.quantityOnHand - reservation.quantity,
          updatedAt: new Date(),
        })
        .where(eq(skuStocks.id, stock.id));

      await tx.insert(inventoryLedgerEntries).values({
        skuStockId: stock.id,
        entryKind: 'CONSUMED',
        quantity: reservation.quantity,
        onHandDelta: -reservation.quantity,
        reservationId: id,
        orderId: reservation.orderId,
        ...actorColumns(actor),
      });
    });
  }

  async findReservation(id: ReservationId): Promise<Reservation | undefined> {
    return this.run('findReservation', async () => {
      const [row] = await this.db
        .select()
        .from(inventoryReservations)
        .where(eq(inventoryReservations.id, id))
        .limit(1);
      return row === undefined ? undefined : toReservation(row);
    });
  }

  /**
   * **DB3 CC-21** — the release-vs-consume arbiter.
   *
   * `DB3_CONCURRENCY_SPECIFICATION.md` CC-21 names the arbiter as *"reservation
   * row LOCK + idempotent transitions"*, and `DB5_LOCKING_ACCESS_PATHS.md`
   * repeats it. Until `APP8-B02` neither terminal path took that lock: both read
   * the status through the unlocked `findReservation`, so a cancellation saga
   * and a production goods-issue could each observe `RESERVED`, and the
   * reservation would end up with a `RESERVATION_RELEASED` ledger row **and** a
   * `CONSUMED` one — plus an on-hand decrement for stock that was also released.
   * Locking `sku_stocks` inside `consumeReservation` did not save it: that lock
   * came *after* the status read, and `releaseReservation` never reached the
   * anchor at all.
   *
   * So the row is taken `FOR UPDATE` **before** the status is looked at, and the
   * status is looked at under that lock, in the same transaction. The second
   * caller blocks on the lock and, when it is released, reads the winner's
   * committed terminal status — `RESERVATION_NOT_ACTIVE`, the delivered refusal,
   * unchanged. One transition, one terminal ledger effect, at most one on-hand
   * decrement.
   *
   * **Lock order.** Reservation row first, `sku_stocks` anchor second. No
   * delivered path locks the anchor and then an *existing* reservation row —
   * `createReservation` and `convertHold` lock the anchor and then *insert*, and
   * a row nobody can name yet cannot be waited on — so this adds no cycle and
   * leaves the proven `orders` → `sku_stocks` direction
   * (`DB8_LOCK_ORDER_MATRIX.md`) untouched. Isolation stays `READ COMMITTED`
   * with explicit locks (DEC-DB7-006); nothing here opts into `SERIALIZABLE`.
   *
   * @requiresTransaction
   */
  private async lockReservedReservation(
    tx: Transaction,
    id: ReservationId,
    operation: string,
  ): Promise<Reservation> {
    const [row] = await tx
      .select()
      .from(inventoryReservations)
      .where(eq(inventoryReservations.id, id))
      .limit(1)
      .for('update');

    if (row === undefined) {
      throw notFoundError(`SkuStockRepository.${operation}`, 'That reservation does not exist.');
    }

    const reservation = toReservation(row);
    if (reservation.status !== 'RESERVED') {
      throw guardViolationError(
        `SkuStockRepository.${operation}`,
        'RESERVATION_NOT_ACTIVE',
        'That reservation is no longer active.',
      );
    }
    return reservation;
  }
}

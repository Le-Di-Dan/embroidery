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
 *
 * The terminal writes themselves — the RESERVED -> RELEASED / CONSUMED row lock,
 * the on-hand decrement and the ledger append — live in
 * `reservation-terminalization.ts`, because `APP8-B04` gave each of them a
 * second entry point keyed by (order, SKU) instead of by reservation id. One
 * write, two ways to name the row it acts on.
 *
 * `APP12-B02` adds the third terminal move, `RESERVED → EXPIRED`, and the
 * optional `expires_at` that makes it reachable. Both are origin-scoped by the
 * data rather than by a branch: a reservation with no `expires_at` — every
 * custom one, by `PO-APP8-002` — can never be selected by the sweep or expired
 * by {@link InventoryReservations.expireReservationIfDue}.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, schema } from '@embroidery/database';
import type { InventoryEntryKind } from '@embroidery/database';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { DatabaseExecutor } from '../runtime/database-executor';
import { eq } from 'drizzle-orm';

import type { SkuId } from './inventory-identity';
import type {
  InventoryActor,
  Reservation,
  ReservationId,
  SoftHoldId,
} from './sku-stock.repository';
import { actorColumns, InventoryCommitments } from './inventory-commitments';
import { ReservationEligibilityGuard } from './reservation-eligibility.guard';
import {
  applyConsume,
  applyExpiry,
  applyRelease,
  lockDueReservation,
  lockOrderReservation,
  lockReservedReservationById,
  reservationNotActive,
  toReservation,
} from './reservation-terminalization';
import { applyWindowReschedule, lockActiveReservationForOrder } from './reservation-window';
import { StockAnchor } from './stock-anchor';

const { skuStocks, inventoryLedgerEntries, inventorySoftHolds, inventoryReservations } = schema;

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

  /**
   * Creates one official reservation against a locked stock anchor.
   *
   * `expiresAt` is optional and **absent means no expiry** — the delivered
   * `PO-APP8-002` semantics for custom reservations, and the reason
   * `inventory_reservations.expires_at` is nullable at all (`ADR-DB1-018` r3).
   * `APP12-B02` is the first caller to supply one: `BR-025` gives a Ready-Made
   * reservation a 24-hour pre-payment window measured from the order's own
   * creation instant. The policy is the caller's — this writer stores the
   * instant it is handed and computes no window of its own, because a window
   * computed here would be a second copy of a business rule that already has a
   * home.
   *
   * @requiresTransaction — rejects when available stock is short (G-DB7-26).
   */
  async createReservation(input: {
    id: ReservationId;
    skuId: SkuId;
    orderId: string;
    quantity: number;
    actor: InventoryActor;
    expiresAt?: Date | undefined;
  }): Promise<Reservation> {
    return this.run('createReservation', async () => {
      const tx = this.requireTransaction('createReservation');
      // G-DB7-27/GRD-013 — same gate as `convertHold`, origin-aware since
      // `APP12-B02`: a Ready-Made order has no deposit to satisfy.
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
          expiresAt: input.expiresAt ?? null,
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
      const reservation = await lockReservedReservationById(tx, id, 'releaseReservation');
      await applyRelease(tx, reservation, reason, actor);
    });
  }

  async consumeReservation(id: ReservationId, actor: InventoryActor): Promise<void> {
    return this.run('consumeReservation', async () => {
      const tx = this.requireTransaction('consumeReservation');
      // CC-21. Before the anchor: a reservation may only be terminalized once,
      // and only the holder of its row lock may decide that.
      const reservation = await lockReservedReservationById(tx, id, 'consumeReservation');
      await applyConsume(tx, reservation, actor, 'consumeReservation');
    });
  }

  /**
   * Consumes the order's active reservation for one SKU — the goods issue at
   * production start (`TR-LC17-05`, `APP8-B04` §9, §10).
   *
   * The caller knows *"this order needs 25 of that SKU"*, derived from the frozen
   * order items by `aggregateCatalogRequirements`; it does not know a
   * reservation id, and must not decide anything from an unlocked read of one. So
   * the whole decision is made here, under the reservation's row lock: which row
   * is active, whether its quantity covers the requirement, and the terminal write
   * itself. An identifier discovered outside the lock could have been released
   * between that read and this write; a *status* read outside it is the CC-21
   * defect `APP8-B02` repaired.
   *
   * The stock anchor is resolved by SKU **without** a lock, deliberately: that is
   * identity, not state — `uq_sku_stocks__sku` makes one row per SKU and no path
   * moves a reservation between anchors — and {@link applyConsume} locks the same
   * anchor before it touches the balance. Locking it here instead would reverse
   * the `APP8-B02` order and put a cycle back into the matrix.
   *
   * Refuses rather than repairs. A missing, released, expired or already-consumed
   * reservation is `RESERVATION_NOT_ACTIVE`; one that does not cover the frozen
   * requirement is `RESERVATION_QUANTITY_INSUFFICIENT`. Neither is patched by
   * creating a replacement reservation or by restocking, and both roll the
   * caller's whole transaction back (`APP8-B04` §10).
   *
   * @requiresTransaction
   */
  async consumeOrderReservation(input: {
    orderId: string;
    skuId: SkuId;
    requiredQuantity: number;
    actor: InventoryActor;
  }): Promise<Reservation> {
    return this.run('consumeOrderReservation', async () => {
      const tx = this.requireTransaction('consumeOrderReservation');
      const stock = await this.anchor.load(tx, input.skuId);
      if (stock === undefined) {
        // No anchor means no reservation for this SKU can ever have existed, so
        // the Catalog requirement is uncovered — the same refusal, not a 404.
        throw reservationNotActive('consumeOrderReservation');
      }

      const reservation = await lockOrderReservation(tx, input.orderId, stock.id);
      if (reservation === undefined) {
        throw reservationNotActive('consumeOrderReservation');
      }
      if (reservation.quantity < input.requiredQuantity) {
        throw guardViolationError(
          'SkuStockRepository.consumeOrderReservation',
          'RESERVATION_QUANTITY_INSUFFICIENT',
          'That reservation does not cover the quantity this order requires.',
        );
      }

      await applyConsume(tx, reservation, input.actor, 'consumeOrderReservation');
      return reservation;
    });
  }

  /**
   * Releases the order's reservation for one SKU **if one is still active**
   * (`TR-LC17-06`, `APP8-B04` §13.2).
   *
   * Returns `undefined` when there is nothing active to release, and that is an
   * ordinary outcome rather than an error: after a production start the
   * reservation is `CONSUMED`, and §13.2 forbids "unconsuming" it or fabricating
   * a release so that the two cancellation paths look alike. A COP portion has no
   * SKU at all and never reaches this method (`PO-APP8-001`).
   *
   * The decision is still taken under the row lock, so a release racing a
   * concurrent consume cannot leave two terminal ledger effects for one
   * reservation.
   *
   * @requiresTransaction
   */
  async releaseOrderReservationIfActive(input: {
    orderId: string;
    skuId: SkuId;
    reason: string;
    actor: InventoryActor;
  }): Promise<Reservation | undefined> {
    return this.run('releaseOrderReservationIfActive', async () => {
      const tx = this.requireTransaction('releaseOrderReservationIfActive');
      const stock = await this.anchor.load(tx, input.skuId);
      if (stock === undefined) {
        return undefined;
      }

      const reservation = await lockOrderReservation(tx, input.orderId, stock.id);
      if (reservation === undefined) {
        return undefined;
      }

      await applyRelease(tx, reservation, input.reason, input.actor);
      return reservation;
    });
  }

  /**
   * Expires one reservation **if it is still due to expire** (`BR-026`).
   *
   * The three facts that make it due, and the lock they are read under, are
   * `lockDueReservation`'s — beside every other terminal decision, for the
   * reason that module states. This method is the transaction boundary and the
   * write, and nothing else.
   *
   * Returns `undefined` when the candidate stopped being due between the
   * sweep's unlocked read and this lock. That is an ordinary outcome rather
   * than an error: the sweep re-reads the world every pass.
   *
   * @requiresTransaction
   */
  async expireReservationIfDue(input: {
    id: ReservationId;
    now: Date;
    actor: InventoryActor;
  }): Promise<Reservation | undefined> {
    return this.run('expireReservationIfDue', async () => {
      const tx = this.requireTransaction('expireReservationIfDue');
      const reservation = await lockDueReservation(tx, input.id, input.now);
      if (reservation === undefined) {
        return undefined;
      }
      await applyExpiry(tx, reservation, input.actor);
      return reservation;
    });
  }

  /**
   * The order's one active reservation, locked (`APP12-B03` §17).
   *
   * @requiresTransaction
   */
  async lockActiveOrderReservation(orderId: string): Promise<Reservation | undefined> {
    return this.run('lockActiveOrderReservation', async () => {
      const tx = this.requireTransaction('lockActiveOrderReservation');
      return lockActiveReservationForOrder(tx, orderId);
    });
  }

  /**
   * Moves a `RESERVED` reservation's payment window (`BR-025`).
   *
   * @requiresTransaction
   */
  async rescheduleReservationExpiry(input: {
    id: ReservationId;
    windowMs: number;
  }): Promise<Reservation> {
    return this.run('rescheduleReservationExpiry', async () => {
      const tx = this.requireTransaction('rescheduleReservationExpiry');
      return applyWindowReschedule(tx, input.id, input.windowMs);
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
}

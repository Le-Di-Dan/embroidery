/**
 * `TR-LC17-04` — a verified deposit becomes the order's official inventory
 * reservation (`APP8-W01` §2, §5–§13).
 *
 * ```text
 * begin
 *   canonical OrderRepository.findById — the event names a real order
 *   canonical OrderRepository.loadItems — the FROZEN subjects and quantities
 *   aggregate the Catalog items by SKU, sorted by SKU id
 *   claim inventory.reserve on (order), fingerprinted by that sku/qty set
 *     replay?      -> return the reservation refs already created, write nothing
 *     in progress? -> transient, come back
 *   for each requirement, in the sorted order:
 *       canonical SkuStockRepository.createReservation
 *           -> GRD-013 deposit gate via DepositEligibilityPort
 *           -> sku_stocks anchor FOR UPDATE, GRD-014 sufficiency under the lock
 *           -> inventory_reservations RESERVED + inventory_ledger_entries RESERVED
 *   complete the claim with the replayable result
 * commit
 * ```
 *
 * ### The transaction is the atomicity (§7)
 *
 * One `runInTransaction` wraps the whole requirement set, and the canonical
 * repository participates in it through the ambient `transactionContext` its
 * executor resolves — the same way it participates in an API use case's
 * transaction. There is no nested commit, no second connection and no
 * `try`/`catch` inside the boundary that could let a subset survive. So a
 * three-SKU order whose third SKU is short leaves **no** reservation and **no**
 * ledger row for the first two, and no compensating release is written to
 * imitate that: the rollback is the mechanism.
 *
 * The low-level surface expressed this without a new abstraction, so none was
 * added to `@embroidery/persistence` (§7's escape hatch is deliberately unused).
 *
 * ### The lock order (§8)
 *
 * `createReservation` takes the `sku_stocks` anchor row lock, so a multi-SKU
 * order takes several in one transaction — the first flow in the repository to
 * do so. They are acquired in ascending SKU id, the order
 * `aggregateCatalogRequirements` returns, sequentially and never concurrently:
 * `Promise.all` over the requirements would issue the locks in completion order
 * and throw the determinism away. Same logical lock set, same acquisition order,
 * on every execution — no cycle to deadlock on, and no `SERIALIZABLE`, advisory
 * lock or distributed lock introduced. The delivered cross-context order
 * (`payment_obligations` read → `sku_stocks` lock, `DB8_LOCK_ORDER_MATRIX.md`
 * §2) is preserved per requirement, because the eligibility read is the first
 * thing `createReservation` does.
 *
 * ### What this deliberately does not do
 *
 * It never calls `ensureStockRow` (§9). `APP8-B01` made anchor creation an Admin
 * inventory operation on purpose; a paid order referencing a SKU whose stock
 * operations have not initialised is an operational failure, not a licence for
 * the order path to invent a zero-stock row. It creates no production job,
 * freezes no specification, moves no order status, consumes no reservation and
 * emits no event — production begins in `APP8-B03`/`B04`.
 *
 * And it holds no deposit predicate of its own (§4). The gate is
 * `DepositEligibilityPort.isDepositSatisfied(orderId)`, reached only through
 * `ReservationEligibilityGuard` inside the canonical repository, so a fabricated
 * or stale `payment.verified` for an unsatisfied obligation is refused by the
 * one implementation of GRD-013 rather than by a copy of it here.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import {
  IdempotencyStore,
  ORDER_REPOSITORY,
  SKU_STOCK_REPOSITORY,
  TransactionManager,
  type IdempotencyKey,
  type OrderId,
  type OrderRepository,
  type ReservationId,
  type SkuStockRepository,
} from '@embroidery/persistence';

import type { PaymentVerifiedLookup } from '../domain/payment-verified.payload';
import { reservationInProgress, reservationRefusal } from '../domain/inventory-reservation.errors';
import {
  INVENTORY_RESERVE_IDEMPOTENCY_TTL_MS,
  INVENTORY_RESERVE_NAMESPACE,
  readReserveOrderResult,
  reserveFingerprint,
  reserveScopeKey,
} from '../domain/order-reserve-idempotency';
import {
  aggregateCatalogRequirements,
  type ReservationRequirement,
} from '../domain/reservation-requirements';

/**
 * The ledger actor for every row this capability appends.
 *
 * `PO-APP8-003` fixes it: *"SYSTEM remains the actor for the payment.verified
 * reservation consumer"*. The key is the operation's own accepted name, so a
 * ledger row and the `idempotency_records` row that guarded it read the same.
 */
const RESERVATION_SYSTEM_JOB_KEY = INVENTORY_RESERVE_NAMESPACE;

/** Exactly what a committed reservation set — or a replay of one — produced. */
export interface ReservedOrderInventory {
  readonly reservationIds: readonly string[];
}

@Injectable()
export class ReserveOrderInventoryUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
  ) {}

  async reserve(lookup: PaymentVerifiedLookup): Promise<ReservedOrderInventory> {
    return this.transactions.runInTransaction(async () => {
      const orderId = lookup.orderId as OrderId;

      // The row, not the event, decides that there is something to reserve for.
      // Without this a fabricated order id would resolve to zero frozen items
      // and be indistinguishable from a legitimate COP-only order — a no-op that
      // reported success for an order that does not exist.
      const order = await this.orders.findById(orderId);
      if (order === undefined) {
        throw reservationRefusal('ORDER_NOT_FOUND', 'That order does not exist.');
      }

      const items = await this.orders.loadItems(orderId);
      const requirements = aggregateCatalogRequirements(items);
      const key = this.keyFor(orderId, requirements);

      const claim = await this.idempotency.claim(
        key,
        new Date(Date.now() + INVENTORY_RESERVE_IDEMPOTENCY_TTL_MS),
      );

      if (claim.outcome === 'replay') {
        // Written in the same transaction as the reservations, so it cannot
        // exist unless they do. Nothing below runs: no second reservation, no
        // second ledger entry and no second commitment against stock.
        const replayed = readReserveOrderResult(claim.result);
        return { reservationIds: replayed?.reservationIds ?? [] };
      }
      if (claim.outcome === 'in_progress') {
        throw reservationInProgress();
      }

      const reservationIds = await this.createReservations(orderId, requirements);
      await this.idempotency.complete(key, { reservationIds });
      return { reservationIds };
    });
  }

  /**
   * Creates the whole set, in lock order, inside the caller's transaction.
   *
   * Sequential by construction. `for…of` with `await` is the ordering; a
   * `Promise.all` here would still take every lock, but in whatever order the
   * connection happened to interleave them.
   */
  private async createReservations(
    orderId: OrderId,
    requirements: readonly ReservationRequirement[],
  ): Promise<string[]> {
    const reservationIds: string[] = [];

    for (const requirement of requirements) {
      const reservation = await this.stock.createReservation({
        id: newId() as ReservationId,
        skuId: requirement.skuId,
        orderId,
        quantity: requirement.quantity,
        // `PO-APP8-002`: APP8 official reservations are no-expiry. The canonical
        // repository writes no `expires_at`, which is this table's explicit
        // no-expiry marker (ADR-DB1-018 r3), so nothing here supplies one.
        actor: { kind: 'SYSTEM', systemJobKey: RESERVATION_SYSTEM_JOB_KEY },
      });
      reservationIds.push(reservation.id);
    }

    return reservationIds;
  }

  private keyFor(
    orderId: OrderId,
    requirements: readonly ReservationRequirement[],
  ): IdempotencyKey {
    return {
      namespace: INVENTORY_RESERVE_NAMESPACE,
      scopeKey: reserveScopeKey(orderId),
      fingerprint: reserveFingerprint(orderId, requirements),
    };
  }
}

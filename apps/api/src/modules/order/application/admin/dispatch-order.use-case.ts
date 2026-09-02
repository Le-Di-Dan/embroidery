/**
 * `TR-LC14-07` — the Admin command that dispatches an order (`APP9-B05`).
 *
 * ```text
 * READY_FOR_DELIVERY -> DELIVERED
 *   actor:    ADMIN
 *   guards:   GRD-016 (remaining SATISFIED) + GRD-017 (shipping complete)
 *   effect:   shipping detail EDITABLE -> FROZEN, one shipping snapshot,
 *             one SHIPPING_FREEZE transition — atomically
 * ```
 *
 * ### It composes the delivered freeze writer rather than restating it
 *
 * `OrderRepository.dispatch` already owns the freeze, the snapshot and the
 * lifecycle move in **one** transaction (`APP9-B05` §17). This use case does not
 * duplicate that SQL, does not freeze in one transaction and transition in
 * another, and does not reach past the repository to `shipping_snapshots`. What
 * it adds is the two things the repository seam cannot supply: the canonical
 * guards that must be evaluated before the write, and the **bound operator** the
 * `order_transitions` row is attributed to — LC-14 makes `TR-LC14-07` an admin
 * move, so the actor is passed in rather than left to the repository's seeding
 * default.
 *
 * ### GRD-016 is checked here, origin-aware, and it is not reassurance
 *
 * Three canonical documents put the remaining-payment check *inside* the
 * dispatch transaction: `DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §2 ("validate
 * GRD-016 (final payment) + shipping detail đầy đủ"), the guard catalog's
 * `GRD-016` row (scope `TR-LC14-06/07`, enforcement `tx`), and `CC-14`
 * ("LOCK + GRD-016 in dispatch tx"). The source state is not a substitute for
 * it: `APP9-B04`'s fee recalculation supersedes a `SATISFIED` balance with a new
 * `PENDING` one **without moving the order**, so an order can sit in
 * `READY_FOR_DELIVERY` owing money. Refusing that is the whole point of the
 * guard, and the read is a kind-aware one through the single AGG-16 authority.
 *
 * *Which* kind is a lookup on the order's origin (`APP12-B05` §22). A
 * Ready-Made order settles one `FULL` obligation and has no `REMAINING` one
 * at any point in its life, so asking for `REMAINING` unconditionally would
 * have refused every paid Ready-Made order for a payment that was collected in
 * full. The supersession hazard applies to it identically — `APP12-B03`'s fee
 * correction supersedes a `FULL` without moving the order — which is why both
 * origins get a live-obligation read rather than a source-state shortcut.
 *
 * ### The transaction and the lock order (§10, §17)
 *
 * ```text
 * 1. orders             FOR UPDATE   loadForUpdate — the decision's own lock
 * 2. shipping_details   FOR UPDATE   lockShippingDetail — GRD-017's subject
 * 3. payment_obligations             findLiveForOrder — GRD-016, kind-aware
 * 4. shipping_details / shipping_snapshots / orders / order_transitions
 *                                    dispatch — freeze + snapshot + move
 * ```
 *
 * `orders → shipping_details → payment_obligations` extends `APP9-B04`'s
 * accepted `shipping_details → payment_obligations` order rather than inverting
 * it, and `DB8_LOCK_ORDER_MATRIX.md` §1 keeps the order row first. No cycle with
 * B04 exists: its Admin write reads `orders` unlocked and never takes that lock,
 * and the obligation read here takes none.
 *
 * Taking the shipping detail's lock at step 2 is what makes GRD-016 sound rather
 * than racy. A concurrent B04 fee increase contends on exactly that row: it
 * either committed first — and its new `PENDING` obligation is what step 3
 * reads, so the dispatch refuses — or it blocks until this transaction commits
 * and then meets a `FROZEN` detail. There is no interleaving in which a dispatch
 * freezes an address a recalculation is still changing (`CC-15`).
 *
 * ### Replay (§10)
 *
 * Deterministic refusal, not a second receipt. `TR-LC14-07` is legal from one
 * state; after the first command commits the order is `DELIVERED`, so a retry
 * fails the source-state assertion under the order's own lock and appends no
 * second snapshot and no second transition. `uq_shipping_snapshots__order` is
 * the physical backstop behind that, and no idempotency store is invented.
 *
 * ### What it deliberately does not do
 *
 * No carrier API, courier webhook, poll, shipment timeline or tracking status
 * (`LIVE_CARRIER_TRACKING = OUT_OF_SCOPE`) — `carrier_name` and `tracking_code`
 * are copied into the snapshot as the static internal notes they are, and
 * neither is *required* to dispatch. No notification intent, email or SMS
 * (`APP9-G01` §8 — APP10 owns customer communication). No payment write: the
 * obligation is read and nothing more. No completion — that is a separate
 * command, and collapsing the two would make `DELIVERED` unobservable.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import type { OrderOrigin, OrderState, ShippingDetailState } from '@embroidery/database';
import {
  ORDER_REPOSITORY,
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type OrderId,
  type OrderRepository,
  type PaymentObligationRepository,
} from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { orderDeliveryError } from '../../domain/lifecycle/order-delivery.errors';
import { settlementObligationKindFor } from '../../domain/lifecycle/settlement-obligation-kind';
import { requireOrderLifecycleAdminId } from './order-lifecycle-actor';

/** The one source state `TR-LC14-07` is legal from. */
export const DISPATCH_SOURCE_STATE = 'READY_FOR_DELIVERY' satisfies OrderState;

/** The one target state `TR-LC14-07` moves to. */
export const DISPATCH_TARGET_STATE = 'DELIVERED' satisfies OrderState;

export interface DispatchOrderResult {
  readonly orderId: string;
  readonly code: string;
  readonly fromStatus: OrderState;
  readonly status: OrderState;
  readonly dispatchedAt: Date;
  readonly shippingStatus: ShippingDetailState;
  readonly frozenAt: Date;
}

@Injectable()
export class DispatchOrderUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async dispatch(orderId: string): Promise<DispatchOrderResult> {
    // Before the transaction opens: an actor fault must not hold a connection.
    const adminId = requireOrderLifecycleAdminId(this.requestContext);
    const correlationId = this.requestContext.requireRequestId();
    const id = orderId as OrderId;

    try {
      return await this.transactions.runInTransaction(async () => {
        // The origin-neutral lock. `loadForUpdate` maps the custom aggregate and
        // refuses a Ready-Made row outright, which made this command — an
        // origin-neutral one — unreachable for half the shop (`APP12-B05` §21).
        // Same statement, same lock, same place in the lock order.
        const order = await this.orders.loadLifecycleForUpdate(id);
        if (order === undefined) {
          throw orderDeliveryError('ORDER_NOT_FOUND');
        }
        if (order.status !== DISPATCH_SOURCE_STATE) {
          throw orderDeliveryError('ORDER_INVALID_TRANSITION');
        }

        await this.assertShippingReady(id);
        await this.assertSettlementSatisfied(order.id, order.origin);

        // One call, one transaction: freeze, snapshot and move. The instant is
        // taken once and used for all three, so `frozen_at`, the snapshot's
        // `dispatched_at` and `orders.delivered_at` cannot disagree about when
        // the order was dispatched.
        const dispatchedAt = new Date();
        const moved = await this.orders.dispatch(id, dispatchedAt, correlationId, {
          kind: 'ADMIN',
          adminId,
        });

        // Read back inside the transaction, so the receipt states committed
        // truth rather than what this code believes it wrote.
        const frozen = await this.orders.loadShippingDetail(id);
        if (frozen?.frozenAt === undefined) {
          // Unreachable: `dispatch` sets both columns under the detail's lock
          // and `ck_shipping_details__frozen_at_required` refuses a FROZEN row
          // without a timestamp. Refused rather than defaulted, because a
          // receipt that invented a freeze time would be evidence of nothing.
          throw orderDeliveryError('ORDER_SHIPPING_NOT_READY');
        }

        return {
          orderId: moved.id,
          code: moved.code,
          fromStatus: order.status,
          status: moved.status,
          dispatchedAt,
          shippingStatus: frozen.status,
          frozenAt: frozen.frozenAt,
        };
      });
    } catch (error: unknown) {
      throw this.translate(error);
    }
  }

  /**
   * `GRD-017` — the shipping detail exists, is still editable, and carries the
   * one nullable fact the freeze cannot do without.
   *
   * The lock is the point of using a locking seam rather than an unlocked read:
   * holding the shipping detail `FOR UPDATE` from here to commit is what
   * serialises this dispatch against a concurrent fee recalculation.
   *
   * `lockShippingDetail` rather than `lockShippingFeeBaseline`, which is what
   * `APP9-B05` used. The two open with the *identical* statement — the same
   * `shipping_details` row, the same `FOR UPDATE`, so the serialisation is
   * unchanged — and the baseline then adds an inner join through
   * `orders.accepted_quotation_version_id` to `quotation_versions`. That column
   * is `NULL` on a Ready-Made order, so the join matched nothing and the whole
   * command answered `ORDER_NOT_FOUND` for an order that plainly exists
   * (`APP12-B05` §21). The quoted fee it fetched was never read here: GRD-017
   * asks whether the *detail* carries a fee, not what a quotation once said.
   *
   * Completeness is the schema's own answer. Recipient, phone, address and
   * province are `NOT NULL` columns, so a stored detail always has them; the fee
   * is nullable on `shipping_details` and `NOT NULL` on `shipping_snapshots`,
   * which is exactly why it is checked. `carrier_name` and `tracking_code` are
   * left alone: no authority makes them a dispatch prerequisite, and requiring
   * them would be a carrier integration smuggled in as a guard.
   */
  private async assertShippingReady(id: OrderId): Promise<void> {
    // The order itself was proved to exist under its own lock by the caller,
    // so a missing detail here is a missing *detail* and says so.
    const detail = await this.orders.lockShippingDetail(id);
    if (detail === undefined || detail.feeAmount === undefined) {
      throw orderDeliveryError('ORDER_SHIPPING_NOT_READY');
    }
    if (detail.status !== 'EDITABLE') {
      // A detail already FROZEN means an order already dispatched, which the
      // source-state assertion has refused; reaching here would mean the two
      // records disagree, and freezing again is not the way to reconcile them.
      throw orderDeliveryError('ORDER_INVALID_TRANSITION');
    }
  }

  /**
   * `GRD-016` — the live obligation this origin settles on must be SATISFIED.
   *
   * The kind comes from the order's own immutable `origin` column, read under
   * the row lock above: `REMAINING` for a custom order, `FULL` for a
   * Ready-Made one. It is not a widened read — `findLiveForOrder` is still
   * kind-aware, and the guard still refuses an order that owes money — but the
   * kind it asks for is no longer a constant only one origin can satisfy.
   *
   * The refusal codes are the delivered ones. They say "remaining payment"
   * because that is the vocabulary APP9 published, and a Ready-Made operator
   * reads them in the same situation — this order still owes its payment — so
   * a parallel Ready-Made family would be two spellings of one refusal.
   */
  private async assertSettlementSatisfied(id: OrderId, origin: OrderOrigin): Promise<void> {
    const kind = settlementObligationKindFor(origin);
    const owed = await this.obligations.findLiveForOrder(id, kind);
    if (owed === undefined) {
      throw orderDeliveryError('ORDER_REMAINING_PAYMENT_MISSING');
    }
    if (owed.status !== 'SATISFIED') {
      throw orderDeliveryError('ORDER_REMAINING_PAYMENT_UNSATISFIED');
    }
  }

  /**
   * Translates the persistence guard codes this command can provoke.
   *
   * The assertions above already refuse every case this route can be asked for,
   * so these are the belt-and-braces ones: the repository re-checks the source
   * state and the detail under its own locks, and its answer must not reach a
   * client as an unmapped 500. Anything else — a SQLSTATE, a constraint name, a
   * retryable `40001`/`40P01` conflict — travels untouched to the platform
   * filter, which already maps and sanitises it.
   */
  private translate(error: unknown): unknown {
    if (!isPersistenceError(error)) {
      return error;
    }
    if (error.code === 'ORDER_NOT_READY_FOR_DELIVERY' || error.code === 'INVALID_TRANSITION') {
      return orderDeliveryError('ORDER_INVALID_TRANSITION');
    }
    if (error.code === 'SHIPPING_NOT_READY' || error.code === 'SHIPPING_FROZEN') {
      return orderDeliveryError('ORDER_SHIPPING_NOT_READY');
    }
    return error;
  }
}

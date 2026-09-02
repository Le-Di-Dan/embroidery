/**
 * Drizzle implementation of the Ready-Made order writer (`APP12-B02`).
 *
 * Two inserts and an outbox append, in the caller's transaction. Everything it
 * refuses to do is as much of the contract as what it does — see
 * `ready-made-order.repository.ts`.
 *
 * ## The origin is stated, never defaulted
 *
 * `orders.origin` is `NOT NULL` with no default (`APP12-DB01`) precisely so a
 * writer has to say which shape it is creating. This one says `READY_MADE` and
 * writes `null` into all three custom-chain columns explicitly rather than
 * omitting them, so the row this file produces can be read against
 * `ck_orders__custom_chain_by_origin` without knowing Drizzle's defaults.
 *
 * ## `created_at` comes back from the database
 *
 * The returned row's `created_at` is the authoritative creation instant
 * (`now()`), and it is what `BR-025`'s 24-hour window is measured from. It is
 * returned rather than assumed because the caller must be able to persist an
 * expiry derived from the instant that actually committed — an application
 * clock read a few milliseconds earlier would be a different, unprovable one.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, schema } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import { and, eq } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { OutboxEventStore } from '../platform/outbox-event-store';
import { applyOrderTransition } from './order-transition-write';
import type { OrderId, TransitionOrderInput } from './order.repository';
import type {
  CreateReadyMadeOrderInput,
  ReadyMadeOrder,
  ReadyMadeOrderRepository,
} from './ready-made-order.repository';

const { orders, orderItems } = schema;

/** `COL-TBL043-12`. This writer creates one shape and names it. */
const READY_MADE = 'READY_MADE';

/** `READY_MADE_ORDER_STATES[0]` — where a Ready-Made order begins (`BR-027`). */
const INITIAL_STATUS: OrderState = 'AWAITING_SHIPPING_FEE';

/** The single line's position. `uq_order_items__order_position` keys on it. */
const ONLY_LINE_POSITION = 1;

type OrderRow = typeof orders.$inferSelect;

@Injectable()
export class DrizzleReadyMadeOrderRepository
  extends DrizzleRepository
  implements ReadyMadeOrderRepository
{
  constructor(
    executor: DatabaseExecutor,
    private readonly outbox: OutboxEventStore,
  ) {
    super(executor);
  }

  async createReadyMade(input: CreateReadyMadeOrderInput): Promise<ReadyMadeOrder> {
    return this.run('createReadyMade', async () => {
      const tx = this.requireTransaction('createReadyMade');

      const [row] = await tx
        .insert(orders)
        .values({
          id: input.id,
          code: input.code,
          origin: READY_MADE,
          // `BR-031` — a Ready-Made order has no request, no accepted quotation
          // and no approval snapshot, and fabricating any of them to satisfy an
          // older assumption is exactly what `APP12-DB01` made impossible.
          customRequestId: null,
          customerId: input.customerId,
          acceptedQuotationVersionId: null,
          currentApprovalSnapshotId: null,
          status: INITIAL_STATUS,
          // The merchandise subtotal (`BR-027`). Not a payable total: no
          // shipping fee has been priced and no obligation exists yet.
          totalAmount: input.line.lineTotalAmount,
          currencyCode: input.line.currencyCode,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'ReadyMadeOrderRepository.createReadyMade',
          'ORDER_NOT_CREATED',
          'Could not create the order.',
        );
      }

      // INV-12: frozen at creation and never edited. `approval_snapshot_id`
      // stays null and the subject is the SKU — `tg_order_items__origin_subject`
      // rejects a Ready-Made line that carries a snapshot or a customer-owned
      // subject, so a mistake here is a constraint violation rather than a
      // quietly wrong order.
      await tx.insert(orderItems).values({
        id: newId(),
        orderId: input.id,
        position: ONLY_LINE_POSITION,
        skuId: input.line.skuId,
        customerOwnedProductId: null,
        productName: input.line.productName,
        variantLabel: input.line.variantLabel ?? null,
        sizeLabel: input.line.sizeLabel ?? null,
        quantity: input.line.quantity,
        unitPriceAmount: input.line.unitPriceAmount,
        lineTotalAmount: input.line.lineTotalAmount,
        currencyCode: input.line.currencyCode,
        approvalSnapshotId: null,
      });

      // SE-006, the same event the custom path appends (G-DB7-54) — one order
      // creation announcement, not two vocabularies. The payload carries
      // canonical references only and states the origin truthfully, so no
      // consumer can mistake this for a custom conversion: there is no
      // `customRequestId` to carry and none is invented.
      await this.outbox.append({
        eventType: 'order.created',
        aggregateKind: 'ORDER',
        aggregateId: input.id,
        payload: { orderId: input.id, code: input.code, origin: READY_MADE },
        payloadSchemaVersion: 1,
      });

      return toReadyMadeOrder(row);
    });
  }

  async findReadyMadeById(id: OrderId): Promise<ReadyMadeOrder | undefined> {
    return this.run('findReadyMadeById', async () => {
      const [row] = await this.db
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.origin, READY_MADE)))
        .limit(1);
      return row === undefined ? undefined : toReadyMadeOrder(row);
    });
  }

  async loadReadyMadeForUpdate(id: OrderId): Promise<ReadyMadeOrder | undefined> {
    return this.run('loadReadyMadeForUpdate', async () => {
      const tx = this.requireTransaction('loadReadyMadeForUpdate');
      // The origin predicate is in the statement rather than checked after the
      // read: a caller authorised only over Ready-Made must not end up holding
      // a lock on a custom order's row while it decides not to act on it.
      const [row] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.origin, READY_MADE)))
        .limit(1)
        .for('update');
      return row === undefined ? undefined : toReadyMadeOrder(row);
    });
  }

  async transitionReadyMade(input: TransitionOrderInput): Promise<ReadyMadeOrder> {
    return this.run('transitionReadyMade', async () => {
      const tx = this.requireTransaction('transitionReadyMade');
      return toReadyMadeOrder(await applyOrderTransition(tx, input));
    });
  }
}

function toReadyMadeOrder(row: OrderRow): ReadyMadeOrder {
  return {
    id: row.id as OrderId,
    code: row.code,
    customerId: row.customerId,
    status: row.status as OrderState,
    totalAmount: row.totalAmount,
    currencyCode: row.currencyCode,
    createdAt: row.createdAt,
  };
}

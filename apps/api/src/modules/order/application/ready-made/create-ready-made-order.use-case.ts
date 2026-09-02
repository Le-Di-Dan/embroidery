/**
 * The Ready-Made order-creation transaction (`APP12-B02`, `BR-021`..`BR-027`).
 *
 * One transaction spans four bounded contexts: Customer resolves the verified
 * identity, Catalog re-reads what the SKU actually is, Inventory commits the
 * stock under the `sku_stocks` anchor lock, and Ordering writes the order, its
 * single frozen line and its shipping detail. `TransactionManager` joins rather
 * than nests, so every collaborator runs inside this one boundary and a failure
 * anywhere unwinds all of it.
 *
 * ## What "exactly one order" protects (`BR-023`)
 *
 * A duplicate submit must not produce a second order, a second line, a second
 * shipping detail, a second reservation or a second `order.created` event.
 * Every one of them is written inside the idempotency claim below, so the
 * database — the `uq_idempotency_records__namespace_scope_key` arbiter — is
 * what makes them singular, not this file's belief about who else is running.
 * There is no process-local lock here and there must not be: one would be
 * silent about the second API replica.
 *
 * ## Nothing the client sent decides money or stock
 *
 * The body carries a challenge id, a SKU id, a quantity and delivery facts, and
 * that is the whole trust boundary (`APP12-B02` §8). The customer is resolved
 * from the challenge; the price is re-resolved from the Catalog rows read in
 * *this* transaction through `resolvePublicSkuUnitPrice` — the one `BR-021`
 * function `APP12-B01` also publishes through, so the advisory figure the
 * client saw and the frozen figure it is charged cannot be computed two ways;
 * the subtotal is `unit price × quantity` in exact `bigint` hundredths; and the
 * stock decision is taken under the anchor lock by the delivered Inventory
 * writer. A price or an availability the client observed earlier is **never**
 * consulted, which is why the request contract has no field to carry one.
 *
 * ## Order of operations, and why it is that order
 *
 * ```text
 * 1  resolve the customer          (nothing may be written for an unverified caller)
 * 2  claim the idempotency key     (before any consequence, so a replay writes none)
 * 3  re-read the SKU               (eligibility and price, in this transaction)
 * 4  compute the subtotal          (exact, no float, no client value)
 * 5  insert the order + line       (the reservation's FK needs the order to exist)
 * 6  save the shipping detail
 * 7  reserve stock under the anchor lock, with expires_at = created_at + 24h
 * 8  complete the idempotency record
 * ```
 *
 * Step 5 before step 7 is forced by `fk_inventory_reservations__order_id`, and
 * it is safe precisely because they share a transaction: an order whose
 * reservation fails never commits, so no `AWAITING_SHIPPING_FEE` order can
 * exist without the stock it is holding (`APP12-B02` §15).
 *
 * The lock order is `orders` (insert) → `sku_stocks` (anchor), which is the
 * direction `DB8_LOCK_ORDER_MATRIX.md` already records; nothing here reverses it.
 *
 * ## What creation deliberately does not do
 *
 * No payment obligation and no payment attempt (`BR-029` — `APP12-B03` creates
 * the `FULL` obligation once an operator has set the fee), no shipping fee and
 * no payable total (`BR-027`), no `ORDER_ACCESS` grant (`APP12-B04`), no
 * production job and no custom artifact of any kind (`BR-030`, `BR-031`).
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import {
  IdempotencyStore,
  ORDER_REPOSITORY,
  READY_MADE_ORDER_REPOSITORY,
  SKU_STOCK_REPOSITORY,
  TransactionManager,
  type IdempotencyKey,
  type OrderId,
  type OrderRepository,
  type ReadyMadeOrderRepository,
  type ReservationId,
  type SkuStockRepository,
} from '@embroidery/persistence';
import { generateOrderCode } from '@embroidery/domain-types';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { VerifiedChallengeIdentityResolver } from '../../../customer/application/verified-challenge-identity.resolver';
import type { ChallengeId } from '../../../customer/domain/repositories/verification-challenge.repository';
import {
  PURCHASABLE_SKU_PORT,
  type PurchasableSkuPort,
} from '../../../catalog/domain/repositories/purchasable-sku.port';
import {
  classifyReadyMadeOrderFailure,
  ReadyMadeOrderError,
} from '../../domain/ready-made/ready-made-order.errors';
import { readyMadeOrderFingerprint } from '../../domain/ready-made/ready-made-order-fingerprint';
import {
  READY_MADE_INITIAL_RESERVATION_WINDOW_MS,
  READY_MADE_ORDER_CREATE_NAMESPACE,
  READY_MADE_ORDER_IDEMPOTENCY_TTL_MS,
} from '../../domain/ready-made/ready-made-order-idempotency';
import { resolveReadyMadeLineMoney } from '../../domain/ready-made/ready-made-line-money';
import {
  decodeReadyMadeOrderResult,
  type CreatedReadyMadeOrderResult,
} from '../../domain/ready-made/ready-made-order-result.codec';

/** The delivery facts a customer supplies. Every one of them is PII (CON-079/080). */
export interface ReadyMadeDeliveryCommand {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly ward?: string | undefined;
  readonly district?: string | undefined;
  readonly province: string;
}

export interface CreateReadyMadeOrderCommand {
  /** The verified `SUBMISSION` challenge. The only identity input a client gives. */
  readonly challengeId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly delivery: ReadyMadeDeliveryCommand;
}

/** The one purpose that authorizes a customer-initiated write (`VERIFICATION_PURPOSES`). */
const SUBMISSION_PURPOSE = 'SUBMISSION';

/** The actor every ledger row and transition this command writes is attributed to. */
const READY_MADE_ORDER_JOB_KEY = 'order.readyMade.create';

@Injectable()
export class CreateReadyMadeOrderUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
    private readonly identities: VerifiedChallengeIdentityResolver,
    @Inject(PURCHASABLE_SKU_PORT) private readonly catalog: PurchasableSkuPort,
    @Inject(READY_MADE_ORDER_REPOSITORY) private readonly orders: ReadyMadeOrderRepository,
    @Inject(ORDER_REPOSITORY) private readonly shipping: OrderRepository,
    @Inject(SKU_STOCK_REPOSITORY) private readonly stock: SkuStockRepository,
    private readonly clock: AuditClock,
  ) {}

  async create(command: CreateReadyMadeOrderCommand): Promise<CreatedReadyMadeOrderResult> {
    const key: IdempotencyKey = {
      namespace: READY_MADE_ORDER_CREATE_NAMESPACE,
      scopeKey: command.challengeId,
      fingerprint: readyMadeOrderFingerprint({
        skuId: command.skuId,
        quantity: command.quantity,
        delivery: {
          recipientName: command.delivery.recipientName,
          recipientPhone: command.delivery.recipientPhone,
          addressLine: command.delivery.addressLine,
          ward: command.delivery.ward,
          district: command.delivery.district,
          province: command.delivery.province,
        },
      }),
    };

    try {
      return await this.runCreation(key, command);
    } catch (error: unknown) {
      throw classifyReadyMadeOrderFailure(error);
    }
  }

  /** One whole attempt. Commits every consequence, or none of them. */
  private async runCreation(
    key: IdempotencyKey,
    command: CreateReadyMadeOrderCommand,
  ): Promise<CreatedReadyMadeOrderResult> {
    return this.transactions.runInTransaction(async () => {
      const now = this.clock.now();
      const customerId = await this.identities.resolve(
        command.challengeId as ChallengeId,
        SUBMISSION_PURPOSE,
        now,
      );
      if (customerId === undefined) {
        throw new ReadyMadeOrderError('VERIFIED_CONTACT_REQUIRED');
      }

      const claim = await this.idempotency.claim(
        key,
        new Date(now.getTime() + READY_MADE_ORDER_IDEMPOTENCY_TTL_MS),
      );
      if (claim.outcome === 'replay') {
        // Completed earlier with this exact fingerprint. Nothing below runs, so
        // no second order, line, shipping detail, reservation or event.
        return decodeReadyMadeOrderResult(claim.result);
      }
      if (claim.outcome === 'in_progress') {
        throw new ReadyMadeOrderError('DUPLICATE_OPERATION');
      }

      // `BR-022` — read now, in this transaction. The client's earlier
      // observation is advisory and is never consulted (`APP12-B01`).
      const sku = await this.catalog.findPurchasable(command.skuId);
      if (sku === undefined) {
        throw new ReadyMadeOrderError('SKU_NOT_AVAILABLE');
      }

      const money = resolveReadyMadeLineMoney(sku, command.quantity);
      if (money === undefined) {
        // The Catalog holds an amount this path cannot price exactly — a scale
        // the VND CHECK would reject, or a subtotal past `numeric(14,2)`.
        // Reported as an unavailable SKU rather than as a client error, because
        // the client sent no amount and can do nothing about it.
        throw new ReadyMadeOrderError('SKU_NOT_AVAILABLE');
      }

      const orderId = newId() as OrderId;
      const order = await this.orders.createReadyMade({
        id: orderId,
        code: generateOrderCode(),
        customerId,
        line: {
          skuId: sku.skuId,
          productName: sku.productName,
          variantLabel: sku.variantLabel,
          sizeLabel: sku.sizeLabel,
          quantity: command.quantity,
          unitPriceAmount: money.unitPriceAmount,
          lineTotalAmount: money.lineTotalAmount,
          currencyCode: money.currencyCode,
        },
      });

      // The delivered shipping writer, in this transaction. `feeAmount` is
      // omitted rather than set to zero: `BR-027` forbids a fabricated
      // shipping-inclusive figure, and a `0` fee would read as "shipping is
      // free" instead of "shipping has not been priced". `APP12-B03` sets it.
      await this.shipping.saveShippingDetails({
        orderId,
        recipientName: command.delivery.recipientName,
        recipientPhone: command.delivery.recipientPhone,
        addressLine: command.delivery.addressLine,
        ward: command.delivery.ward,
        district: command.delivery.district,
        province: command.delivery.province,
      });

      // `BR-025` — measured from the order's own committed `created_at`, which
      // the writer returned, never from an application clock read earlier.
      const expiresAt = new Date(
        order.createdAt.getTime() + READY_MADE_INITIAL_RESERVATION_WINDOW_MS,
      );

      // `BR-024` + GRD-014 — the delivered writer takes the `sku_stocks` anchor
      // row lock, re-reads availability under it and refuses if short. No
      // availability figure read anywhere else in this file influences it.
      await this.stock.createReservation({
        id: newId() as ReservationId,
        // The Catalog port and the Inventory contract brand `SkuId` identically,
        // so the value crosses the seam without a cast — and a cast here would
        // be the place a future divergence went unnoticed.
        skuId: sku.skuId,
        orderId,
        quantity: command.quantity,
        actor: { kind: 'SYSTEM', systemJobKey: READY_MADE_ORDER_JOB_KEY },
        expiresAt,
      });

      const result: CreatedReadyMadeOrderResult = {
        // The committed row's own values, not the ones handed in: a replay must
        // serve what the order actually carries.
        orderCode: order.code,
        status: order.status,
        merchandiseSubtotal: { amount: order.totalAmount, currency: order.currencyCode },
        reservationExpiresAt: expiresAt.toISOString(),
      };
      await this.idempotency.complete(key, result);
      return result;
    });
  }
}

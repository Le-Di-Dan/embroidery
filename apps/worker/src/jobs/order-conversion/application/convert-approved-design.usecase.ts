/**
 * `TR-LC14-01` — one approval becomes exactly one order (`APP7-W01`).
 *
 * ```text
 * begin
 *   claim order.create on (request, approval snapshot)
 *     replay? -> return the order that was already created, write nothing
 *     in progress? -> transient, come back
 *   re-read the Approval Snapshot and require it to name this request
 *   resolve the request's ACCEPTED quotation version — exactly one, never latest
 *   resolve the frozen subject: one ACTIVE SKU, or the frozen COP
 *   project the frozen lines from the accepted version's own priced lines
 *   require both accepted obligation amounts to be representable
 *   create order + items + DEPOSIT + REMAINING + order.created   (one method)
 *   complete the claim with the replayable result
 * commit
 * ```
 *
 * There is no `try`/`catch` inside the transaction that could let a subset
 * commit, and no compensation path: a failure anywhere leaves no order, no item,
 * no obligation, no `order.created` row and no completed idempotency record —
 * and leaves the approval exactly as APP6 committed it. `SE-005` says what
 * happens next in so many words: *"approval stands; order retried
 * idempotently."*
 *
 * ### What this deliberately does not do
 *
 * No payment attempt, no bank configuration, no QR, no reference, no evidence,
 * no verification, no `DEPOSIT_PAID`, no inventory reservation, no soft hold, no
 * production job. The order stops at `AWAITING_DEPOSIT`, which is the state the
 * repository writes and the only state this checkpoint can produce. It also
 * never sends anything: `order.created` is an outbox row the delivered APP4
 * `notification-delivery` capability carries, and INV-23 forbids a network call
 * inside this transaction.
 *
 * ### Why the deposit is not a gate here
 *
 * Because `TR-LC14-01` is gated on the **approval**, and the deposit is
 * `TR-LC14-02`. The database says the same thing more bluntly:
 * `payment_obligations.order_id` is `NOT NULL`, so the deposit obligation cannot
 * exist until this transaction has written the order (`APP7-R00` §3.1).
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { IdempotencyStore, TransactionManager, type IdempotencyKey } from '@embroidery/persistence';

import type { DesignApprovedLookup } from '../domain/design-approved.payload';
import { conversionInProgress, conversionRefusal } from '../domain/order-conversion.errors';
import { generateOrderCode } from '../domain/order-code';
import {
  ORDER_CREATE_IDEMPOTENCY_TTL_MS,
  ORDER_CREATE_NAMESPACE,
  orderCreateFingerprint,
  orderCreateScopeKey,
  readOrderCreateResult,
  type OrderCreateScope,
} from '../domain/order-create-idempotency';
import { projectOrderItems, type ConversionSubject } from '../domain/order-conversion.projection';
import {
  ORDER_CONVERSION_REPOSITORY,
  type AcceptedQuotationVersion,
  type ConvertedOrder,
  type FrozenApprovalSnapshot,
  type OrderConversionRepository,
} from '../domain/repositories/order-conversion.repository';

@Injectable()
export class ConvertApprovedDesignUseCase {
  constructor(
    @Inject(ORDER_CONVERSION_REPOSITORY) private readonly orders: OrderConversionRepository,
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
  ) {}

  async convert(lookup: DesignApprovedLookup): Promise<ConvertedOrder> {
    return this.transactions.runInTransaction(async () => {
      const scope: OrderCreateScope = {
        customRequestId: lookup.customRequestId,
        approvalSnapshotId: lookup.approvalSnapshotId,
      };
      const key = this.keyFor(scope);
      const claim = await this.idempotency.claim(
        key,
        new Date(Date.now() + ORDER_CREATE_IDEMPOTENCY_TTL_MS),
      );

      if (claim.outcome === 'replay') {
        // Written in the same transaction as the order, so it cannot exist
        // unless that order does. Nothing below runs: no second order, no
        // second item, no second obligation and no second `order.created`.
        const replayed = readOrderCreateResult(claim.result);
        if (replayed !== undefined) {
          return { id: replayed.orderId, code: replayed.code };
        }
        // A completed claim whose stored result cannot be read is not a licence
        // to convert again — `uq_orders__request` still holds, and the order it
        // describes is one read away.
        return await this.requireExistingOrder(lookup.customRequestId);
      }
      if (claim.outcome === 'in_progress') {
        throw conversionInProgress();
      }

      // The claim is fresh, which does not prove no order exists: an expired
      // record can be swept while the order it guarded stays forever. The
      // physical arbiter is `uq_orders__request`; this read is how a swept
      // record replays instead of colliding with it.
      const existing = await this.orders.findOrderByRequest(lookup.customRequestId);
      if (existing !== undefined) {
        await this.idempotency.complete(key, { orderId: existing.id, code: existing.code });
        return existing;
      }

      const snapshot = await this.requireSnapshot(lookup);
      const version = await this.requireAcceptedVersion(snapshot);
      const subject = await this.resolveSubject(snapshot);

      const projected = projectOrderItems(snapshot, version, subject);
      if (!projected.ok) {
        throw projected.error;
      }

      assertObligationAmount(version.depositAmount);
      assertObligationAmount(version.remainingAmount);

      const created = await this.orders.createConvertedOrder({
        id: newId(),
        code: generateOrderCode(),
        customRequestId: snapshot.customRequestId,
        acceptedQuotationVersionId: version.id,
        approvalSnapshotId: snapshot.id,
        items: projected.items,
        depositObligationId: newId(),
        // Copied, never recomputed: not 40 % of anything, not re-rounded, and
        // not derived from the other by subtraction (`APP7-W01` §5).
        depositAmount: version.depositAmount,
        remainingObligationId: newId(),
        remainingAmount: version.remainingAmount,
      });

      await this.idempotency.complete(key, { orderId: created.id, code: created.code });
      return created;
    });
  }

  private async requireSnapshot(lookup: DesignApprovedLookup): Promise<FrozenApprovalSnapshot> {
    const snapshot = await this.orders.findApprovalSnapshot(lookup.approvalSnapshotId);
    if (snapshot === undefined) {
      throw conversionRefusal('APPROVAL_NOT_FOUND', 'That approval does not exist.');
    }
    if (snapshot.customRequestId !== lookup.customRequestId) {
      // The payload is a lookup key and this is what makes it one: the row, not
      // the event, decides which request is being converted. A foreign snapshot
      // never reaches the chain guard.
      throw conversionRefusal(
        'APPROVAL_BELONGS_TO_ANOTHER_REQUEST',
        'That approval does not belong to this request.',
      );
    }
    return snapshot;
  }

  /**
   * The exact accepted version.
   *
   * Resolved by **status**, from the request, and never through
   * `custom_requests.current_quotation_id` or `quotations.current_version_id`:
   * both are pointers to what the customer is looking at now, not to what they
   * accepted, and `APP7-W01` §5 forbids either as version authority. Zero and
   * several are different refusals; neither is settled by picking.
   */
  private async requireAcceptedVersion(
    snapshot: FrozenApprovalSnapshot,
  ): Promise<AcceptedQuotationVersion> {
    const accepted = await this.orders.findAcceptedQuotationVersions(snapshot.customRequestId);
    if (accepted.length === 0) {
      throw conversionRefusal(
        'QUOTE_NOT_ACCEPTED',
        'This request has no accepted quotation version.',
      );
    }
    if (accepted.length > 1) {
      throw conversionRefusal(
        'ACCEPTED_QUOTATION_AMBIGUOUS',
        'This request resolves to more than one accepted quotation version.',
      );
    }
    return accepted[0] as AcceptedQuotationVersion;
  }

  /**
   * The frozen branch's live identity.
   *
   * This is the one place `APP7-W01` §6 permits a live read, and only because
   * `order_items` needs a currently valid foreign identity that no snapshot
   * column holds: `ck_order_items__exactly_one_subject` demands a `sku_id`, and
   * an Approval Snapshot names a **variant**. Nothing else about the subject is
   * read live — the name and the label still come from the snapshot.
   */
  private async resolveSubject(snapshot: FrozenApprovalSnapshot): Promise<ConversionSubject> {
    if (snapshot.customerOwnedProductId !== undefined) {
      const product = await this.orders.findCustomerOwnedProduct(snapshot.customerOwnedProductId);
      if (product === undefined) {
        throw conversionRefusal(
          'CUSTOMER_OWNED_PRODUCT_NOT_FOUND',
          'That customer-supplied product does not exist.',
        );
      }
      if (product.customRequestId !== snapshot.customRequestId) {
        throw conversionRefusal(
          'CUSTOMER_OWNED_PRODUCT_BELONGS_TO_ANOTHER_REQUEST',
          'That customer-supplied product does not belong to this request.',
        );
      }
      return {
        branch: 'CUSTOMER_OWNED',
        customerOwnedProductId: product.id,
        name: product.name,
      };
    }

    if (snapshot.productVariantId === undefined) {
      // Unreachable while `ck_approval_snapshots__exactly_one_placement_branch`
      // holds: a snapshot with neither branch cannot be stored. Refused rather
      // than defaulted, because the alternative is guessing a subject.
      throw conversionRefusal('APPROVAL_NOT_FOUND', 'That approval names no product to order.');
    }

    const skuIds = await this.orders.findActiveSkuIdsForVariant(snapshot.productVariantId);
    if (skuIds.length === 0) {
      // The gap `APP7-B01` closed at the authoring end. W01 only consumes the
      // valid state; it never creates, synthesises or activates a SKU, and it
      // mutates no Catalog row.
      throw conversionRefusal(
        'CATALOG_SKU_NOT_FOUND',
        'The approved product variant has no active SKU to order.',
      );
    }
    if (skuIds.length > 1) {
      // `skus.product_variant_id` carries no unique constraint, so this is
      // representable. Never first, latest, smallest, by id or by code.
      throw conversionRefusal(
        'CATALOG_SKU_AMBIGUOUS',
        'The approved product variant has more than one active SKU.',
      );
    }
    return { branch: 'CATALOG', skuId: skuIds[0] as string };
  }

  private async requireExistingOrder(customRequestId: string): Promise<ConvertedOrder> {
    const existing = await this.orders.findOrderByRequest(customRequestId);
    if (existing === undefined) {
      throw conversionRefusal(
        'APPROVAL_NOT_FOUND',
        'A completed conversion names no order for this request.',
      );
    }
    return existing;
  }

  private keyFor(scope: OrderCreateScope): IdempotencyKey {
    return {
      namespace: ORDER_CREATE_NAMESPACE,
      scopeKey: orderCreateScopeKey(scope),
      fingerprint: orderCreateFingerprint(scope),
    };
  }
}

/**
 * `ck_payment_obligations__amount_positive` in application terms.
 *
 * Read, never rewritten: the value that fails is the value the accepted version
 * holds, and the answer is a named refusal rather than a substituted amount.
 */
function assertObligationAmount(amount: string): void {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw conversionRefusal(
      'OBLIGATION_AMOUNT_NOT_POSITIVE',
      'The accepted quotation does not express both a deposit and a remaining amount.',
    );
  }
}

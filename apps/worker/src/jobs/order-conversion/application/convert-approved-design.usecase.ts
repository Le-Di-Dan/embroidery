/**
 * `TR-LC14-01` — one approval becomes exactly one order (`APP7-W01`, corrected
 * by `APP7-W01-C1`).
 *
 * ```text
 * begin
 *   claim order.create on (request, approval snapshot)
 *     replay? -> return the order that was already created, write nothing
 *     in progress? -> transient, come back
 *   canonical OrderRepository.findByRequest — replay a swept claim
 *   re-read the Approval Snapshot and require it to name this request
 *   resolve the request's ACCEPTED quotation version — exactly one, never latest
 *   resolve the frozen subject: one ACTIVE SKU, or the frozen COP
 *   project the frozen lines from the accepted version's own priced lines
 *   canonical OrderRepository.createFromAcceptedQuotation
 *       -> GRD-009 / G-DB7-05, orders, order_items, order.created
 *   canonical PaymentObligationRepository.createForOrder x2  (DEPOSIT, REMAINING)
 *   complete the claim with the replayable result
 * commit
 * ```
 *
 * ### What C1 changed, and why
 *
 * `APP7-W01` wrote the order, its items, both obligations and `order.created`
 * with SQL of its own, and restated GRD-009 in a worker-local guard, because the
 * worker may not import `apps/api`. The boundary was real; the conclusion was
 * wrong. Two implementations of the chain check are free to disagree about which
 * customer's approval may be paired with which customer's price — and every
 * foreign key would still be satisfied, which is exactly the defect G-DB7-05
 * exists to catch (INV-19).
 *
 * The delivered DB7 implementations moved to `@embroidery/persistence`
 * unchanged, and this use case now calls the **same classes the API calls**. It
 * keeps only what is genuinely W01's: decoding the hand-off, coordinating the
 * claim, reading the frozen conversion inputs, resolving the subject, projecting
 * the lines, and owning the transaction the whole thing commits in.
 *
 * ### Atomicity is unchanged
 *
 * `TransactionManager.runInTransaction` is still opened here, and both canonical
 * repositories participate in it through the ambient `transactionContext` their
 * executor resolves — the same way they participate in an API use case's
 * transaction. There is no nested commit, no second connection and no
 * `try`/`catch` inside the boundary that could let a subset survive. A failure
 * anywhere leaves no order, no item, no obligation, no `order.created` and no
 * completed claim, and leaves the approval exactly as APP6 committed it. SE-005
 * says what happens next in so many words: *"approval stands; order retried
 * idempotently."*
 *
 * ### What this deliberately does not do
 *
 * No payment attempt, no bank configuration, no QR, no reference, no evidence,
 * no verification, no `DEPOSIT_PAID`, no inventory reservation, no soft hold, no
 * production job. The order stops at `AWAITING_DEPOSIT`, which is the only state
 * the canonical repository writes at creation. It also never sends anything:
 * `order.created` is an outbox row the delivered APP4 `notification-delivery`
 * capability carries, and INV-23 forbids a network call inside this transaction.
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
import {
  IdempotencyStore,
  ORDER_REPOSITORY,
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type CustomRequestId,
  type IdempotencyKey,
  type ObligationId,
  type Order,
  type OrderId,
  type OrderRepository,
  type PaymentObligationRepository,
} from '@embroidery/persistence';

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
  CONVERSION_AUTHORITY_REPOSITORY,
  type AcceptedQuotationVersion,
  type ConversionAuthorityRepository,
  type FrozenApprovalSnapshot,
} from '../domain/repositories/conversion-authority.repository';

/** Exactly what a committed conversion — or a replay of one — is identified by. */
export interface ConvertedOrder {
  readonly id: string;
  readonly code: string;
}

@Injectable()
export class ConvertApprovedDesignUseCase {
  constructor(
    @Inject(CONVERSION_AUTHORITY_REPOSITORY)
    private readonly authority: ConversionAuthorityRepository,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
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
      const existing = await this.orders.findByRequest(requestId(lookup.customRequestId));
      if (existing !== undefined) {
        await this.idempotency.complete(key, { orderId: existing.id, code: existing.code });
        return { id: existing.id, code: existing.code };
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

      const orderId = newId() as OrderId;
      // The canonical Order authority: it re-reads GRD-009 / G-DB7-05 itself,
      // takes the customer, total and currency from that verified chain rather
      // than from this caller, freezes the items and appends the one
      // `order.created` (SE-006 / G-DB7-54). Nothing here may pre-validate the
      // chain and hand it a boolean — the guard's own identity is what must be
      // single, not merely its answer.
      const order = await this.orders.createFromAcceptedQuotation({
        id: orderId,
        code: generateOrderCode(),
        customRequestId: requestId(snapshot.customRequestId),
        acceptedQuotationVersionId: version.id,
        approvalSnapshotId: snapshot.id,
        items: projected.items,
      });

      // INV-04 / `TR-LC15-01`: **both** obligations, in this transaction. APP7
      // never makes the remaining one payable — that is `TR-LC14-05`, APP9's —
      // but an order that exists without it would be an order whose second
      // instalment nothing records. Amounts are copied, never recomputed: not
      // 40 % of anything, not re-rounded, and not derived from the other by
      // subtraction (`APP7-W01` §5). No `payment_attempts` row is created.
      await this.obligations.createForOrder({
        id: newId() as ObligationId,
        orderId: order.id,
        kind: 'DEPOSIT',
        amount: version.depositAmount,
        sourceQuotationVersionId: version.id,
      });
      await this.obligations.createForOrder({
        id: newId() as ObligationId,
        orderId: order.id,
        kind: 'REMAINING',
        amount: version.remainingAmount,
        sourceQuotationVersionId: version.id,
      });

      await this.idempotency.complete(key, { orderId: order.id, code: order.code });
      return { id: order.id, code: order.code };
    });
  }

  private async requireSnapshot(lookup: DesignApprovedLookup): Promise<FrozenApprovalSnapshot> {
    const snapshot = await this.authority.findApprovalSnapshot(lookup.approvalSnapshotId);
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
    const accepted = await this.authority.findAcceptedQuotationVersions(snapshot.customRequestId);
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
      const product = await this.authority.findCustomerOwnedProduct(
        snapshot.customerOwnedProductId,
      );
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

    const skuIds = await this.authority.findActiveSkuIdsForVariant(snapshot.productVariantId);
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
    const existing: Order | undefined = await this.orders.findByRequest(requestId(customRequestId));
    if (existing === undefined) {
      throw conversionRefusal(
        'APPROVAL_NOT_FOUND',
        'A completed conversion names no order for this request.',
      );
    }
    return { id: existing.id, code: existing.code };
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
 * The one cast this file makes.
 *
 * `CustomRequestId` is branded so a bare string cannot be passed as a request
 * id. The value here came out of `outbox_events.payload` and out of
 * `approval_snapshots.custom_request_id`, neither of which carries the brand —
 * and the canonical repository re-reads the chain from that id anyway, so a
 * wrong one is refused by GRD-009 rather than trusted.
 */
function requestId(value: string): CustomRequestId {
  return value as CustomRequestId;
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

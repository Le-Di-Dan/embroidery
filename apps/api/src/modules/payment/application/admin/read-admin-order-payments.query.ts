/**
 * One order's payment vertical, for an operator (`APP7-B04` §7, §9, §28, §36;
 * generalized past DEPOSIT by `APP12-A02-C1`).
 *
 * ### Zero-write, by construction
 *
 * Four collaborators, and not one of them can write: a read repository whose
 * whole contract is four `select`s, a read-only Ordering port with one
 * projection, and the Asset repository used through its non-locking scoped batch
 * read. There is no transaction manager here, no `PAYMENT_OBLIGATION_REPOSITORY`
 * and no `ORDER_REPOSITORY` — so this query cannot settle an attempt, satisfy an
 * obligation, move an order or append an outbox row even by mistake, and its
 * module's imports say so before any code does.
 *
 * ### It does not restate `APP7-B02`
 *
 * No frozen line items, no accepted quotation version, no approval snapshot, no
 * order total, no customer id. Those are the Admin order detail's, and repeating
 * them here would make this a second authority on what an order looks like. What
 * it adds is the payment vertical B02 deliberately left out.
 *
 * ### The evidence read is association-first
 *
 * Associations are listed from `payment_transfer_evidence` for the attempts of
 * **this** obligation, and only those asset ids are then resolved — through
 * `findScopedByIds`, filtered to the customer-upload lane. An id outside that
 * lane is simply absent, so no arbitrary `assetId` can be fetched and no probe
 * can learn that a private asset exists. No byte is served: `APP7-B06` owns the
 * one Admin binary delivery operation.
 *
 * ### One kind, chosen by the order's origin (`APP12-A02-C1`)
 *
 * `APP7-B04` hard-coded `kind = 'DEPOSIT'` in the obligation lookup, on the
 * reasoning that `REMAINING` exists from order creation (INV-04) and is APP9's
 * to collect — a response showing it as payable would invite an operator to
 * take money APP7 had no flow for. That reasoning still holds for a custom
 * order and the DEPOSIT is still the only kind this surface offers there.
 *
 * What it did not survive is `APP12-B02`. A Ready-Made order has **no** deposit
 * at any point in its life (`BR-029`), so the hard-coded filter missed, the
 * `obligation === undefined` branch fired, and half the shop answered
 * `ORDER_NOT_FOUND` — for an order that plainly exists and that the Admin
 * shipping surface was already pricing. `adminPaymentAttempt_verify` accepts a
 * `FULL` attempt since `APP12-B05`, but no read published the `attemptId` it is
 * addressed by, so the delivered command had no reachable caller.
 *
 * The kind now comes from `order.origin`, the immutable `COL-TBL043-12`
 * discriminator: `CUSTOM → DEPOSIT`, `READY_MADE → FULL`. It is **not** derived
 * from which obligations exist — that inversion would make a Ready-Made order
 * before its first shipping fee, which has no obligation at all, indistinguishable
 * from an order of the wrong shape.
 *
 * ### "Nothing to collect yet" is not "no such order"
 *
 * A Ready-Made order at `AWAITING_SHIPPING_FEE` legitimately has no live
 * obligation, and this read answers `200` with `currentObligation` absent and
 * no attempts. A **custom** order missing its DEPOSIT is still the original
 * `ORDER_NOT_FOUND`: INV-04 and `uq_payment_obligations__order_kind__live`
 * guarantee one exists from creation, so its absence means the order is not one
 * this surface can answer for.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { OrderOrigin, OrderState, PaymentObligationKind } from '@embroidery/database';

import {
  ASSET_REPOSITORY,
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import {
  ORDER_DEPOSIT_CONTEXT_PORT,
  type OrderDepositContextPort,
} from '../../../order/domain/repositories/order-deposit-context.port';
import { depositTransferReference } from '../../domain/deposit/deposit-reference';
import { fullTransferReference } from '../../domain/full-payment/full-payment-reference';
import {
  TRANSFER_EVIDENCE_ASSET_KIND,
  TRANSFER_EVIDENCE_CLASSIFICATION,
} from '../../domain/evidence/transfer-evidence.policy';
import {
  ADMIN_PAYMENT_READ_REPOSITORY,
  type AdminPaymentReadRepository,
  type AdminTransferEvidenceRow,
} from '../../domain/repositories/admin-payment-read.repository';
import { AdminPaymentReadError } from '../../domain/verification/payment-verification.errors';
import {
  ADMIN_EVIDENCE_STATUS,
  type AdminEvidenceView,
  type AdminOrderPaymentsView,
  type AdminPaymentAttemptView,
} from './admin-payment.view';

/**
 * What each origin is collected against, and the memo it is paid with
 * (`APP12-A02-C1`).
 *
 * One table keyed on the **order's** discriminator rather than two keyed on
 * different things, so a kind and a reference builder cannot be paired wrongly:
 * there is no row here in which `FULL` could acquire the deposit's `…DC` memo.
 * An origin added to `ORDER_ORIGINS` later fails to compile against this
 * `Record` rather than silently inheriting the deposit's behaviour.
 *
 * The two builders are kept separate for the reason `APP7-G01` §4 gives —
 * neither can derive the other's memo — and an operator reconciling a bank
 * statement is therefore comparing against the exact string the customer was
 * given for that exact obligation.
 *
 * `REMAINING` is unreachable through this table, deliberately. It exists on
 * every custom order from creation (INV-04) and APP9 collects it through its
 * own lifecycle; `APP7-B04`'s rule that this surface must never present it as
 * payable is unchanged by this correction.
 */
const COLLECTED: Readonly<
  Record<
    OrderOrigin,
    { readonly kind: PaymentObligationKind; readonly reference: (code: string) => string }
  >
> = {
  CUSTOM: { kind: 'DEPOSIT', reference: depositTransferReference },
  READY_MADE: { kind: 'FULL', reference: fullTransferReference },
};

/** The origin whose obligation INV-04 guarantees from order creation. */
const CUSTOM: OrderOrigin = 'CUSTOM';

@Injectable()
export class ReadAdminOrderPayments {
  constructor(
    @Inject(ADMIN_PAYMENT_READ_REPOSITORY) private readonly payments: AdminPaymentReadRepository,
    @Inject(ORDER_DEPOSIT_CONTEXT_PORT) private readonly orders: OrderDepositContextPort,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
  ) {}

  async read(orderId: string): Promise<AdminOrderPaymentsView> {
    const order = await this.orders.findOrderById(orderId);
    if (order === undefined) {
      throw new AdminPaymentReadError();
    }

    const collected = COLLECTED[order.origin];
    const obligation = await this.payments.findLiveObligation(order.id, collected.kind);

    if (obligation === undefined) {
      if (order.origin === CUSTOM) {
        // A custom order gets both obligations in its creation transaction
        // (INV-04, `uq_payment_obligations__order_kind__live`), so a missing
        // DEPOSIT means the order itself is not one this surface can answer for.
        // Reported as the same `ORDER_NOT_FOUND` rather than a second code: from
        // an operator's position the two are one situation, and inventing
        // `DEPOSIT_MISSING` would publish a state the writer cannot produce.
        throw new AdminPaymentReadError();
      }
      // A Ready-Made order at `AWAITING_SHIPPING_FEE` has no FULL obligation
      // yet — `APP12-B03` creates it with the first shipping fee (`BR-029`) —
      // and that is an ordinary state of a real order, not a missing one. The
      // Admin detail renders before the fee is set, so answering 404 here is
      // what made the branch unbuildable.
      return this.emptyView(order);
    }

    const attempts = await this.payments.listAttempts(obligation.id);
    const attemptIds = attempts.map((attempt) => attempt.id);

    const [associations, reconciliations] = await Promise.all([
      this.payments.listEvidence(attemptIds),
      this.payments.listReconciliations(obligation.id, attemptIds),
    ]);

    const evidenceByAttempt = await this.projectEvidence(associations);

    return {
      orderId: order.id,
      orderCode: order.code,
      orderStatus: order.status,
      origin: order.origin,
      currentObligation: {
        obligationId: obligation.id,
        // Read back off the row rather than echoing `collected.kind`, so the
        // response reports what the database holds and a mismatch between the
        // order's origin and its obligation would show rather than be hidden.
        kind: obligation.kind,
        status: obligation.status,
        // The obligation's own column. No 40 % recomputation, no live quotation
        // read, no catalog price, and for a Ready-Made order no subtotal + fee
        // re-derivation (`APP7-B04` §12, `APP12-B03`).
        expectedAmount: obligation.amount,
        expectedCurrencyCode: obligation.currencyCode,
        // Derived from the order code by the builder this kind is paid against;
        // nothing stores it, so nothing can disagree with what the customer was
        // shown.
        expectedTransferReference: collected.reference(order.code),
        satisfiedByAttemptId: obligation.satisfiedByAttemptId,
        satisfiedAt: obligation.satisfiedAt,
      },
      attempts: attempts.map((attempt): AdminPaymentAttemptView => ({
        attemptId: attempt.id,
        method: attempt.method,
        status: attempt.status,
        amount: attempt.amount,
        currencyCode: attempt.currencyCode,
        reviewReason: attempt.reviewReason,
        succeededAt: attempt.succeededAt,
        failedAt: attempt.failedAt,
        expiresAt: attempt.expiresAt,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
        evidence: evidenceByAttempt.get(attempt.id) ?? [],
      })),
      reconciliations: reconciliations.map((row) => ({
        reconciliationId: row.id,
        paymentAttemptId: row.paymentAttemptId,
        action: row.action,
        resolvedStatus: row.resolvedStatus,
        amount: row.amount,
        reason: row.reason,
        adminId: row.adminId,
        bankReference: row.bankReference,
        createdAt: row.createdAt,
      })),
    };
  }

  /**
   * A real order with nothing to collect yet (`APP12-A02-C1`).
   *
   * The order's own facts, and three deliberate absences: no obligation, no
   * attempt, no reconciliation. Nothing is fabricated to fill the gap — no
   * provisional obligation, no zero amount and no placeholder transfer
   * reference — because `APP12-B03` §14 forbids a provisional obligation and a
   * memo shown before one exists is a memo a customer could pay against
   * nothing.
   */
  private emptyView(order: {
    readonly id: string;
    readonly code: string;
    readonly status: OrderState;
    readonly origin: OrderOrigin;
  }): AdminOrderPaymentsView {
    return {
      orderId: order.id,
      orderCode: order.code,
      orderStatus: order.status,
      origin: order.origin,
      currentObligation: undefined,
      attempts: [],
      reconciliations: [],
    };
  }

  /**
   * Resolves the association rows into per-attempt evidence metadata.
   *
   * One scoped batch read for the whole set rather than one query per row, and
   * `findScopedByIds` rather than `findById`: the lane filter is what makes an
   * id outside `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` absent instead of
   * returned, so this cannot be turned into a general asset reader.
   */
  private async projectEvidence(
    associations: readonly AdminTransferEvidenceRow[],
  ): Promise<Map<string, AdminEvidenceView[]>> {
    const byAttempt = new Map<string, AdminEvidenceView[]>();
    if (associations.length === 0) {
      // Zero evidence is an ordinary, valid deposit (`APP7-G01` §7.6), so it is
      // an empty map and not a refusal.
      return byAttempt;
    }

    const assets = await this.assets.findScopedByIds(
      associations.map((row) => row.assetId as AssetId),
      { kind: TRANSFER_EVIDENCE_ASSET_KIND, classification: TRANSFER_EVIDENCE_CLASSIFICATION },
    );
    const assetById = new Map<string, Asset>(assets.map((asset) => [asset.id as string, asset]));

    for (const association of associations) {
      const asset = assetById.get(association.assetId);
      // An association whose asset the lane scope does not match is dropped
      // rather than reported with a fabricated status. It is unreachable —
      // intake writes both in one flow — and a `!` here would be the one place a
      // malformed pair became a `TypeError` on an operator's payment screen.
      if (asset === undefined) {
        continue;
      }
      const status = ADMIN_EVIDENCE_STATUS[asset.status] ?? 'REJECTED';
      const item: AdminEvidenceView = {
        evidenceId: association.id,
        assetStatus: status,
        mediaType: asset.mimeType,
        // `size_bytes` is a `bigint` because the column is one; an image bounded
        // at 10 MiB is far inside the safe integer range.
        byteSize: Number(asset.sizeBytes),
        createdAt: association.createdAt,
        previewEligible: status === 'ACCEPTED',
      };
      const bucket = byAttempt.get(association.paymentAttemptId);
      if (bucket === undefined) {
        byAttempt.set(association.paymentAttemptId, [item]);
      } else {
        bucket.push(item);
      }
    }
    return byAttempt;
  }
}

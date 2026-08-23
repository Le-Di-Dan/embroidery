/**
 * One order's DEPOSIT payment vertical, for an operator (`APP7-B04` §7, §9,
 * §28, §36).
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
 * ### `REMAINING` is never here
 *
 * `findDepositObligation` filters `kind = 'DEPOSIT'` in SQL. The remaining
 * obligation exists from order creation (INV-04) and is APP9's to collect; a
 * response that showed it as payable would invite an operator to take money
 * APP7 has no flow for.
 */
import { Inject, Injectable } from '@nestjs/common';

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

    const obligation = await this.payments.findDepositObligation(order.id);
    if (obligation === undefined) {
      // An order always gets both obligations in its creation transaction
      // (INV-04, `uq_payment_obligations__order_kind__live`), so a missing
      // DEPOSIT means the order itself is not one this surface can answer for.
      // Reported as the same `ORDER_NOT_FOUND` rather than a second code: from
      // an operator's position the two are one situation, and inventing
      // `DEPOSIT_MISSING` would publish a state the writer cannot produce.
      throw new AdminPaymentReadError();
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
      depositObligationId: obligation.id,
      depositStatus: obligation.status,
      // The obligation's own column. No 40 % recomputation, no live quotation
      // read and no catalog price (`APP7-B04` §12).
      expectedAmount: obligation.amount,
      expectedCurrencyCode: obligation.currencyCode,
      // Derived from the order code by the one B03 function; nothing stores it,
      // so nothing can disagree with what the customer was shown.
      expectedTransferReference: depositTransferReference(order.code),
      satisfiedByAttemptId: obligation.satisfiedByAttemptId,
      satisfiedAt: obligation.satisfiedAt,
      attempts: attempts.map(
        (attempt): AdminPaymentAttemptView => ({
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
        }),
      ),
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

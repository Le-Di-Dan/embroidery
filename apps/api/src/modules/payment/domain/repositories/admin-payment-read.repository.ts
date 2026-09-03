/**
 * The Admin deposit-payment read model (`APP7-B04` §7, §9, §29).
 *
 * A **read-only** CTX-PAY seam beside the canonical `PaymentObligationRepository`,
 * for the reason `AdminOrderReadRepository` exists one aggregate over: an
 * operator's payment screen needs the obligation, every attempt against it, the
 * evidence association metadata and the reconciliation history in one shape, and
 * assembling that from the write contract's `findById` / `listAttempts` would be
 * four round trips answering a question neither method was built for.
 *
 * It is not a second payment authority. There is no `settle`, no `satisfy`, no
 * `append` and no transaction on this contract — three methods, all `select` —
 * so a module that holds only this cannot move a payment state. `APP7-B04`'s
 * verification and review use the shared canonical writer and nothing here.
 *
 * ### It reads CTX-PAY tables only
 *
 * `payment_obligations`, `payment_attempts`, `payment_reconciliations` and
 * `payment_transfer_evidence` — all owned by this context. The **order** comes
 * from `ORDER_DEPOSIT_CONTEXT_PORT` and the **assets** from `ASSET_REPOSITORY`,
 * because `BACKEND_CONVENTIONS.md` §10 forbids reading another module's tables
 * and both contexts already publish a narrow read contract for exactly this.
 */
import type {
  PaymentAttemptState,
  PaymentObligationKind,
  PaymentObligationState,
  PaymentReconciliationAction,
} from '@embroidery/database';

export const ADMIN_PAYMENT_READ_REPOSITORY = Symbol('ADMIN_PAYMENT_READ_REPOSITORY');

/**
 * The live obligation row of one kind, as the Admin surface reports it.
 *
 * `kind` is carried rather than assumed by the caller. Until `APP12-A02-C1`
 * this type was `AdminDepositObligationRow` and the one statement behind it
 * hard-coded `kind = 'DEPOSIT'`, which is why the whole Admin payment vertical
 * answered `ORDER_NOT_FOUND` for a Ready-Made order — an order that by
 * `BR-029` has a `FULL` obligation and never a deposit.
 */
export interface AdminObligationRow {
  readonly id: string;
  readonly kind: PaymentObligationKind;
  readonly status: PaymentObligationState;
  readonly amount: string;
  readonly currencyCode: string;
  readonly satisfiedByAttemptId: string | undefined;
  readonly satisfiedAt: Date | undefined;
}

/**
 * One attempt.
 *
 * `providerKey` and `providerRef` are deliberately **not** here. This flow has
 * no provider (`APP7-G01` §1, IMP-O007 open), so both columns are null on every
 * row APP7 can produce, and publishing a field whose only value is `null` would
 * be a contract promise a later provider phase would have to keep.
 */
export interface AdminPaymentAttemptRow {
  readonly id: string;
  readonly method: string;
  readonly status: PaymentAttemptState;
  readonly amount: string;
  readonly currencyCode: string;
  readonly reviewReason: string | undefined;
  readonly succeededAt: Date | undefined;
  readonly failedAt: Date | undefined;
  readonly expiresAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One evidence association, without any asset fact.
 *
 * AGG-08 owns the asset row and answers for it; this carries the association and
 * the id the caller then resolves through the scoped asset read. Keeping the two
 * apart is what stops an evidence projection from turning into a second place
 * that decides what an asset's public status is.
 */
export interface AdminTransferEvidenceRow {
  readonly id: string;
  readonly paymentAttemptId: string;
  readonly assetId: string;
  readonly createdAt: Date;
}

/**
 * One reconciliation record.
 *
 * `admin_id` is the DEV-DB6-015 no-FK evidence column and is reported as the
 * bare id it is. `bank_reference` is the memo an operator observed on a received
 * transfer — not a merchant account number, not a provider identifier and not a
 * storage fact.
 */
export interface AdminReconciliationRow {
  readonly id: string;
  readonly paymentAttemptId: string | undefined;
  readonly action: PaymentReconciliationAction;
  readonly resolvedStatus: string | undefined;
  readonly amount: string | undefined;
  readonly reason: string;
  readonly adminId: string;
  readonly bankReference: string | undefined;
  readonly createdAt: Date;
}

export interface AdminPaymentReadRepository {
  /**
   * The live obligation of one order **and one kind**, or nothing.
   *
   * "Live" matches `uq_payment_obligations__order_kind__live` — `PENDING` or
   * `SATISFIED` — so at most one row per kind can qualify. That partial unique
   * index is the whole reason there is no "latest obligation", "highest id" or
   * "newest `created_at`" arbiter anywhere in this file: after a `APP12-B03`
   * shipping-fee correction the predecessor is `SUPERSEDED` and therefore not
   * live, so the successor is the only row this returns, by construction rather
   * than by an ordering rule a caller could get wrong.
   *
   * The kind is a **parameter**, not a constant, since `APP12-A02-C1`. It is
   * chosen from the order's `origin` by the caller — never from which
   * obligations happen to exist, which would make "this order has not been
   * priced yet" indistinguishable from "this is not a Ready-Made order".
   */
  findLiveObligation(
    orderId: string,
    kind: PaymentObligationKind,
  ): Promise<AdminObligationRow | undefined>;

  /** Every attempt on one obligation, oldest first, `id` breaking a tie. */
  listAttempts(obligationId: string): Promise<AdminPaymentAttemptRow[]>;

  /** Every evidence association across a set of attempts, oldest first. */
  listEvidence(attemptIds: readonly string[]): Promise<AdminTransferEvidenceRow[]>;

  /**
   * One association addressed by its own id, or nothing (`APP7-B06` §4, §5).
   *
   * Added by `APP7-B06` rather than by a second repository, because B04 and B06
   * already share `payment_transfer_evidence` and two API-local statements
   * against one table is how the two quietly stop meaning the same thing. This
   * is the narrowest reusable method that answers B06's question, and it stays
   * on the read seam: there is no write, no lock and no transaction on this
   * contract, so the delivery module can hold it and still be structurally
   * incapable of moving a payment.
   *
   * It resolves the association **only when it names a live payment attempt**.
   * The FK makes an orphan unreachable, so the join is not a defence against a
   * missing row — it is what makes "the association resolves one attempt" a
   * property of the statement rather than of a caller's restraint, on the
   * pattern `DrizzleRequestAssetDeliveryRepository` set for its role filter.
   *
   * Deliberately absent: any method taking an `assetId`. `APP7-B06` §24 forbids
   * a generic Admin asset binary, and a lookup that could serve one is not
   * declared here for a refactor to find.
   */
  findEvidenceForDelivery(evidenceId: string): Promise<AdminTransferEvidenceRow | undefined>;

  /**
   * The reconciliation history for one obligation and its attempts, oldest
   * first.
   *
   * Both targets, because TBL-057 lets a row name either (COL-TBL057-02: at
   * least one target set) and an operator reading one deposit must see every
   * manual action taken on it.
   */
  listReconciliations(
    obligationId: string,
    attemptIds: readonly string[],
  ): Promise<AdminReconciliationRow[]>;
}

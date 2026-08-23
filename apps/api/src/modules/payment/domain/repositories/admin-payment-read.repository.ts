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
  PaymentObligationState,
  PaymentReconciliationAction,
} from '@embroidery/database';

export const ADMIN_PAYMENT_READ_REPOSITORY = Symbol('ADMIN_PAYMENT_READ_REPOSITORY');

/** The DEPOSIT obligation row, as the Admin surface reports it. */
export interface AdminDepositObligationRow {
  readonly id: string;
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
   * The live `DEPOSIT` obligation of one order, or nothing.
   *
   * "Live" matches `uq_payment_obligations__order_kind__live` — `PENDING` or
   * `SATISFIED` — so at most one row can qualify and there is no "latest
   * obligation" heuristic to invent.
   */
  findDepositObligation(orderId: string): Promise<AdminDepositObligationRow | undefined>;

  /** Every attempt on one obligation, oldest first, `id` breaking a tie. */
  listAttempts(obligationId: string): Promise<AdminPaymentAttemptRow[]>;

  /** Every evidence association across a set of attempts, oldest first. */
  listEvidence(attemptIds: readonly string[]): Promise<AdminTransferEvidenceRow[]>;

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

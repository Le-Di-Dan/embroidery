/**
 * AGG-16 Payment Obligation persistence contract (TBL-054..TBL-058).
 *
 * Deposit and remaining are **independent obligations** (INV-04), not two
 * fields on an order: each has its own amount, its own attempts and its own
 * satisfaction evidence.
 *
 * Carries **G-DB7-06** (the satisfying attempt must belong to the obligation),
 * **G-DB7-31** (an obligation exists only via an order), **G-DB7-32**
 * (provider events ingest idempotently), **G-DB7-33** (satisfaction evidence
 * matches amount and currency) and **G-DB7-35/36** (refund ceiling and
 * execution evidence).
 *
 * Money evidence is immutable: S24 triggers freeze provider events,
 * reconciliations and refund amounts, so nothing here offers to edit them.
 */
import type {
  PaymentAttemptState,
  PaymentObligationKind,
  PaymentObligationState,
  PaymentProviderEventOutcome,
  RefundState,
} from '@embroidery/database';

export type ObligationId = string & { readonly __brand: 'ObligationId' };
export type AttemptId = string & { readonly __brand: 'AttemptId' };
export type RefundId = string & { readonly __brand: 'RefundId' };

export interface PaymentObligation {
  readonly id: ObligationId;
  readonly orderId: string;
  readonly kind: PaymentObligationKind;
  readonly amount: string;
  readonly currencyCode: string;
  readonly status: PaymentObligationState;
  readonly satisfiedByAttemptId: AttemptId | undefined;
  readonly satisfiedAt: Date | undefined;
}

export interface PaymentAttempt {
  readonly id: AttemptId;
  readonly paymentObligationId: ObligationId;
  readonly amount: string;
  readonly currencyCode: string;
  readonly method: string;
  readonly status: PaymentAttemptState;
  readonly providerRef: string | undefined;
}

/**
 * One attempt and its obligation, read together under the attempt's row lock
 * (`APP7-B04`).
 *
 * The Admin verification transaction must prove a whole chain — the attempt
 * belongs to *this* obligation, the obligation is the `DEPOSIT` one, and it
 * belongs to *this* order — before it moves a single row. Reading both halves in
 * one locked call is what makes the chain the transaction proves the same chain
 * the writes then act on; two unlocked reads could each be true of a different
 * instant.
 *
 * `FOR UPDATE` is on the **attempt** alone. It is the row every competing
 * verification of the same attempt contends on, and taking it first fixes the
 * lock order as `payment_attempts` → `payment_obligations` (`satisfy`) →
 * `orders` (`transition`). The obligation is deliberately *not* locked here:
 * `satisfy` locks it and re-reads its state, and taking it early would make two
 * verifications of two different attempts on one deposit queue on each other
 * before either had proved anything.
 */
export interface VerifiableAttempt {
  readonly attempt: PaymentAttempt;
  readonly obligation: PaymentObligation;
}

export interface Refund {
  readonly id: RefundId;
  readonly paymentAttemptId: AttemptId;
  readonly orderId: string;
  readonly amount: string;
  readonly status: RefundState;
  readonly reason: string;
}

export interface CreateObligationInput {
  readonly id: ObligationId;
  readonly orderId: string;
  readonly kind: PaymentObligationKind;
  readonly amount: string;
  /** The priced version this obligation derives from — the amount's provenance. */
  readonly sourceQuotationVersionId: string;
}

export interface OpenAttemptInput {
  readonly id: AttemptId;
  readonly paymentObligationId: ObligationId;
  readonly amount: string;
  readonly method: string;
  readonly providerKey?: string | undefined;
  readonly grantId?: string | undefined;
  readonly stepUpChallengeId?: string | undefined;
  readonly expiresAt?: Date | undefined;
}

export interface RecordProviderEventInput {
  readonly providerKey: string;
  /** The provider's own event id — the idempotency arbiter (INV-07). */
  readonly providerEventRef: string;
  readonly paymentAttemptId?: AttemptId | undefined;
  readonly eventKind: string;
  readonly amount?: string | undefined;
  /** Already redacted by the adapter: no card data, no provider secret. */
  readonly redactedPayload: Record<string, unknown>;
  readonly signatureValid: boolean;
  readonly applicationOutcome: PaymentProviderEventOutcome;
  readonly receivedAt: Date;
}

/** A duplicate callback is a replay, not an error (GRD-012). */
export type ProviderEventOutcome =
  { readonly outcome: 'recorded'; readonly id: bigint } | { readonly outcome: 'replay' };

export const PAYMENT_OBLIGATION_REPOSITORY = Symbol('PAYMENT_OBLIGATION_REPOSITORY');

export interface PaymentObligationRepository {
  /** @requiresTransaction */
  createForOrder(input: CreateObligationInput): Promise<PaymentObligation>;

  /** @requiresTransaction */
  openAttempt(input: OpenAttemptInput): Promise<PaymentAttempt>;

  /** @requiresTransaction */
  settleAttempt(
    id: AttemptId,
    status: PaymentAttemptState,
    at: Date,
    reviewReason?: string,
  ): Promise<PaymentAttempt>;

  /**
   * Locks one attempt and reads it with the obligation it belongs to
   * (`APP7-B04`).
   *
   * `undefined` for an attempt that does not exist, and for one whose obligation
   * cannot be read — a caller that cannot see the obligation cannot prove the
   * chain, so it must refuse rather than act on half of it.
   *
   * @requiresTransaction
   */
  lockAttemptForVerification(id: AttemptId): Promise<VerifiableAttempt | undefined>;

  /**
   * Marks the obligation satisfied by one of **its own** succeeded attempts
   * (G-DB7-06, G-DB7-33).
   *
   * The attempt must belong to this obligation, have SUCCEEDED, and match its
   * amount and currency — all read inside the satisfying transaction.
   *
   * @requiresTransaction
   */
  satisfy(id: ObligationId, attemptId: AttemptId, at: Date): Promise<PaymentObligation>;

  /** @requiresTransaction */
  cancel(id: ObligationId): Promise<void>;

  /**
   * Ingests a provider callback idempotently (G-DB7-32 / INV-07).
   *
   * A duplicate `(provider, event ref)` returns `replay` rather than failing:
   * providers retry, and treating that as an error would turn a correct
   * redelivery into an incident.
   *
   * @requiresTransaction
   */
  recordProviderEvent(input: RecordProviderEventInput): Promise<ProviderEventOutcome>;

  /** @requiresTransaction — append-only manual reconciliation evidence. */
  appendReconciliation(input: {
    paymentAttemptId?: AttemptId | undefined;
    paymentObligationId?: ObligationId | undefined;
    action: string;
    reason: string;
    adminId: string;
    amount?: string | undefined;
    /**
     * The status the reconciled attempt or obligation landed on (COL-TBL057-04).
     *
     * TBL-057 deliberately leaves this column without a CHECK — it records
     * LC-16's set or LC-15's, depending on which target was resolved — so the
     * caller states the status it actually produced rather than a combined enum
     * inventing one.
     */
    resolvedStatus?: string | undefined;
    /**
     * The transfer reference the operator observed on the received payment
     * (COL-TBL057-08).
     *
     * The bank memo the money arrived with, not a provider identifier: this flow
     * has no provider (`APP7-G01` §1). Never a storage key, a secure token or a
     * merchant account number.
     */
    bankReference?: string | undefined;
  }): Promise<void>;

  /** @requiresTransaction — amount must not exceed what remains refundable (G-DB7-35). */
  openRefund(input: {
    id: RefundId;
    paymentAttemptId: AttemptId;
    orderId: string;
    amount: string;
    reason: string;
  }): Promise<Refund>;

  /** @requiresTransaction */
  approveRefund(id: RefundId, adminId: string, at: Date): Promise<Refund>;

  /** @requiresTransaction — only an approved refund may execute (G-DB7-36). */
  executeRefund(
    id: RefundId,
    adminId: string,
    method: string,
    transferReference: string,
    at: Date,
  ): Promise<Refund>;

  findById(id: ObligationId): Promise<PaymentObligation | undefined>;
  findLiveForOrder(
    orderId: string,
    kind: PaymentObligationKind,
  ): Promise<PaymentObligation | undefined>;
  loadAttempt(id: AttemptId): Promise<PaymentAttempt | undefined>;
  listAttempts(id: ObligationId): Promise<PaymentAttempt[]>;
  findRefund(id: RefundId): Promise<Refund | undefined>;
  /** Settled minus already-refunded, for the refund ceiling. */
  refundableAmount(attemptId: AttemptId): Promise<string>;
}

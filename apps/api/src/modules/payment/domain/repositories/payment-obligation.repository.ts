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

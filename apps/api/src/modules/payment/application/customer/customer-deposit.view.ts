/**
 * What the customer is told about their deposit (`APP7-B03` §14).
 *
 * The minimum authoritative set the `APP7-S01` screen needs, and deliberately
 * nothing more.
 *
 * ### What is absent, and why each absence matters
 *
 * No grant id or token, no step-up challenge id, no customer id, no admin id, no
 * idempotency key, no provider field, no reconciliation internal, no evidence
 * data, no object key, no bucket, no raw audit or outbox field — and no
 * REMAINING obligation detail of any kind. The type has nowhere to put one, so a
 * column added to `orders` or `payment_obligations` later cannot reach an
 * anonymous browser without an edit here.
 *
 * ### Two states, never one boolean
 *
 * `orderStatus` and `depositStatus` are carried as the accepted state names.
 * There is no `paid` flag: `APP7-G01` §12.2 keeps "the customer transferred",
 * "evidence was submitted" and "an Admin verified funds" three separate facts
 * with three separate authorities, and a boolean here would be the first place
 * they collapsed. The screen distinguishes deposit-pending from
 * deposit-satisfied by reading the two states it is given.
 *
 * ### No attempt projection
 *
 * `APP7-B03` §14 admits an attempt projection only where current lifecycle gives
 * a truthful deterministic one. LC-16 does not: a retry is a *new* attempt, no
 * uniqueness constraint bounds live attempts, and no accepted rule names a
 * "current" one. Picking the newest by `created_at` would be a selection rule
 * invented for convenience, so none is invented and the view carries no attempt
 * field.
 *
 * ### No evidence copy
 *
 * The prominent "capture your transfer receipt" reminder is `APP7-D01`/`S01`
 * design authority (`APP7-G01` §12.1), not a backend string. This view mentions
 * evidence nowhere.
 */
import type { OrderState, PaymentObligationState } from '@embroidery/database';

/**
 * The merchant account the transfer goes to.
 *
 * Every field is server-owned configuration, and it reaches the customer only
 * through this projection. The BIN is carried because the QR encodes it and an
 * operator diagnosing a mis-scan needs the two to be comparable; it is a public
 * NAPAS acquirer id, not a credential.
 */
export interface DepositBankInstructionsView {
  readonly bankBin: string;
  readonly bankDisplayName: string;
  readonly accountNumber: string;
  readonly accountName: string;
  /** `ORD` + the order code body + `DC` — derived, never stored. */
  readonly transferReference: string;
}

export interface CustomerDepositView {
  /** The customer-facing order code, `ORD-XXXXXXXXXX`. Never an authorization input. */
  readonly orderCode: string;
  readonly orderStatus: OrderState;
  readonly depositStatus: PaymentObligationState;
  /** The DEPOSIT obligation's own frozen amount, as stored. Never recomputed. */
  readonly depositAmount: string;
  /** The obligation's own currency. `VND`, enforced physically. */
  readonly currencyCode: string;
  readonly bankInstructions: DepositBankInstructionsView;
  /** When the secure link stops opening this deposit. */
  readonly accessExpiresAt: Date;
}

/** What one initiation committed. Refs and committed facts only. */
export interface DepositAttemptView {
  readonly attemptId: string;
  /** `BANK_TRANSFER`, always. There is no provider in this flow. */
  readonly method: string;
  /** `PENDING`, always: a customer action never settles an attempt. */
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  /** True when this response replayed an earlier identical initiation. */
  readonly replayed: boolean;
}

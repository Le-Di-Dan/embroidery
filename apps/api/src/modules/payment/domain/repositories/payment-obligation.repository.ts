/**
 * AGG-16 Payment Obligation persistence contract — re-exported from its shared
 * home (`APP7-W01-C1`).
 *
 * Moved to `@embroidery/persistence` (`src/payment/`) alongside AGG-15, for the
 * reason `APP7-W01` §6 states: a worker-local seam is permitted only for facts
 * the canonical repositories do not already own, and `createForOrder` owns
 * obligation creation. `APP7-W01` had the worker inserting `payment_obligations`
 * with SQL of its own; that second writer is gone.
 *
 * This file is a re-export and holds no logic. `PAYMENT_OBLIGATION_REPOSITORY`
 * is the **same Symbol instance**, so the delivered payment suites and the
 * Inventory eligibility guard resolve exactly what they always did.
 *
 * Delivered DB7 behaviour is unchanged: deposit and remaining are independent
 * obligations (INV-04), G-DB7-06 and G-DB7-33 are re-read inside the satisfying
 * transaction, provider events ingest idempotently (G-DB7-32 / INV-07), and
 * money evidence stays immutable under its S24 triggers.
 */
export { PAYMENT_OBLIGATION_REPOSITORY } from '@embroidery/persistence';
export type {
  AttemptId,
  CreateObligationInput,
  ObligationId,
  OpenAttemptInput,
  PaymentAttempt,
  PaymentObligation,
  PaymentObligationRepository,
  ProviderEventOutcome,
  RecordProviderEventInput,
  Refund,
  RefundId,
} from '@embroidery/persistence';

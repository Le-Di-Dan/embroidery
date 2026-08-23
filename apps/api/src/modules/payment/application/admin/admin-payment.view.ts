/**
 * What an operator is told about one order's deposit (`APP7-B04` §7, §9, §28).
 *
 * ### Canonical states, never a synthesised `paid`
 *
 * The order's LC-14 state, the obligation's LC-15 state and each attempt's LC-16
 * state are reported as themselves. There is no `paid: true`, no `settled` and
 * no merged status: `APP7-G01` §12.2 separates *transferred* / *evidence
 * submitted* / *verified* into three facts with three authorities, and a single
 * boolean would be the exact collapse it forbids — one that reads as "the money
 * arrived" when what it actually knows is "an image was uploaded".
 *
 * ### The redaction is the shape
 *
 * There is nowhere in these types to put a storage key, a bucket, an object URL,
 * a checksum, a fingerprint, a scanner detail, a secure token, a grant id, a
 * step-up challenge id, a customer id, a merchant bank value or a provider
 * field. A column added to `assets` or `payment_attempts` later cannot reach an
 * operator's browser without an edit here.
 *
 * `providerKey` and `providerRef` are absent rather than null: this flow has no
 * provider (IMP-O007 stays open), so the fields would be a contract promise with
 * no value behind them and no UI use.
 *
 * ### `previewEligible` is a projection, not an authority
 *
 * It is `assetStatus === 'ACCEPTED'` and nothing else — a hint for `APP7-B06`'s
 * Admin binary delivery and `APP7-A01`'s screen, so neither has to re-derive the
 * rule. It says nothing about payment: `APP7-G01` §7.6 and `APP7-B04` §10 make
 * evidence supporting material only, and a deposit with **zero** evidence
 * verifies exactly as normally as one with five.
 */
import type {
  OrderState,
  PaymentAttemptState,
  PaymentObligationState,
  PaymentReconciliationAction,
} from '@embroidery/database';

/** The four LC-06 states an operator is entitled to distinguish on evidence. */
export type AdminEvidenceStatus = 'UPLOADED' | 'INSPECTING' | 'ACCEPTED' | 'REJECTED';

/**
 * `DELETION_PENDING` and `DELETED` collapse into `REJECTED`, exactly as the
 * customer projection decides it: an asset in either state is being removed, and
 * the only question the answer drives — "is this image still standing as
 * evidence?" — has the same answer for all three.
 */
export const ADMIN_EVIDENCE_STATUS: Readonly<Record<string, AdminEvidenceStatus>> = {
  UPLOADED: 'UPLOADED',
  INSPECTING: 'INSPECTING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  DELETION_PENDING: 'REJECTED',
  DELETED: 'REJECTED',
};

export interface AdminEvidenceView {
  /** `payment_transfer_evidence.id` — the association, never the asset id. */
  readonly evidenceId: string;
  readonly assetStatus: AdminEvidenceStatus;
  readonly mediaType: string;
  /** Server-measured at intake. Never a value a client declared. */
  readonly byteSize: number;
  readonly createdAt: Date;
  /** `assetStatus === 'ACCEPTED'`. A delivery hint, never a payment fact. */
  readonly previewEligible: boolean;
}

export interface AdminPaymentAttemptView {
  readonly attemptId: string;
  readonly method: string;
  readonly status: PaymentAttemptState;
  readonly amount: string;
  readonly currencyCode: string;
  /** Mandatory on `REQUIRES_REVIEW` entry (COL-TBL055-11); absent otherwise. */
  readonly reviewReason: string | undefined;
  readonly succeededAt: Date | undefined;
  readonly failedAt: Date | undefined;
  readonly expiresAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly evidence: readonly AdminEvidenceView[];
}

export interface AdminReconciliationView {
  readonly reconciliationId: string;
  readonly paymentAttemptId: string | undefined;
  readonly action: PaymentReconciliationAction;
  readonly resolvedStatus: string | undefined;
  readonly amount: string | undefined;
  readonly reason: string;
  /** DEV-DB6-015 — a no-FK evidence reference, reported as the bare id it is. */
  readonly adminId: string;
  readonly bankReference: string | undefined;
  readonly createdAt: Date;
}

export interface AdminOrderPaymentsView {
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: OrderState;
  readonly depositObligationId: string;
  readonly depositStatus: PaymentObligationState;
  /** The obligation's own frozen amount. Never a share recomputed from a quote. */
  readonly expectedAmount: string;
  readonly expectedCurrencyCode: string;
  /** `APP7-G01` §4, derived from the order code. Nothing persists it. */
  readonly expectedTransferReference: string;
  readonly satisfiedByAttemptId: string | undefined;
  readonly satisfiedAt: Date | undefined;
  readonly attempts: readonly AdminPaymentAttemptView[];
  readonly reconciliations: readonly AdminReconciliationView[];
}

/** What one verify or review committed. Durable facts only, no claim beyond them. */
export interface PaymentDecisionView {
  readonly attemptId: string;
  readonly attemptStatus: PaymentAttemptState;
  readonly depositObligationId: string;
  readonly depositStatus: PaymentObligationState;
  readonly orderId: string;
  readonly orderStatus: OrderState;
  readonly reconciliationAction: PaymentReconciliationAction;
  /**
   * True when this response reported a verification that had **already**
   * committed — the network-timeout retry of `APP7-B04` §22. Nothing was written
   * a second time.
   */
  readonly replayed: boolean;
}

/**
 * The worker's notification persistence contract (`APP4-W01`).
 *
 * A **worker-local** port over TBL-070/TBL-071, not a borrowed one. The
 * delivered `NotificationIntentRepository` lives in
 * `apps/api/src/modules/notification`, and importing it here would be an
 * app-to-app dependency — the exact coupling `@embroidery/notification-delivery`
 * was extracted to avoid. Moving that module into a package instead would drag
 * intake, masking, the intent-key derivation and an Admin-shaped policy path
 * into a worker that needs none of them.
 *
 * So the worker declares the four operations it actually performs, and no more.
 * There is deliberately **no** `claimBatch` here: `outbox_events` is the only
 * queue (`ADR-APP4-001` §13), and a claim method on this interface would be an
 * invitation to build a second one.
 *
 * The two writes are separated by what they mean rather than by what they
 * touch. `beginProcessing` is the pre-send transition; `settleAttempt` is the
 * one atomic durable effect of a delivery try — the evidence row and the
 * intent's resulting state, which must agree or neither should exist.
 */
import type { NotificationDeliveryFailure } from '../delivery-failure';

/** The lifecycle states TBL-070 allows (DB3 `LC` +1). */
export type NotificationIntentStatus =
  'PENDING' | 'PROCESSING' | 'SATISFIED' | 'FAILED' | 'CANCELLED';

/** States from which no further delivery may happen, for any reason. */
export const TERMINAL_INTENT_STATUSES: readonly NotificationIntentStatus[] = [
  'SATISFIED',
  'FAILED',
  'CANCELLED',
];

/**
 * The non-secret facts a delivery needs about its current intent.
 *
 * No `params`, no masked recipient and no template: the real recipient comes
 * from the envelope, and reading the masked copy would only invite comparing it
 * against plaintext.
 */
export interface CurrentNotificationIntent {
  readonly id: string;
  readonly channel: string;
  readonly status: NotificationIntentStatus;
}

/** COL-TBL071-03's closed outcome set. */
export type NotificationDeliveryOutcome = 'DELIVERED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';

export interface SettleAttemptInput {
  readonly intentId: string;
  /**
   * The channel the attempt was filed under.
   *
   * A plain string, matching COL-TBL071-02, which carries no closed-set CHECK
   * (DEV-DB6-016). A pre-send failure files under the intent's own recorded
   * channel — the envelope's may be unreadable, and inventing a resolved
   * channel for a row that never reached a transport would assert more than
   * happened.
   */
  readonly channel: string;
  readonly outcome: NotificationDeliveryOutcome;
  /** A bounded class from the closed taxonomy. Never a provider body. */
  readonly failure?: NotificationDeliveryFailure | undefined;
  readonly attemptedAt: Date;
  /**
   * The intent state this attempt settles on, when it settles one.
   *
   * `undefined` for a retryable attempt: the intent stays `PROCESSING` and the
   * same outbox row comes back later. `FAILED` is terminal and never reopened —
   * a replay is a new intent (`ADR-APP4-001` §8.2).
   */
  readonly settleTo?: 'SATISFIED' | 'FAILED' | undefined;
}

export interface NotificationDeliveryRepository {
  /** The current intent named by the outbox aggregate linkage, if it exists. */
  findIntent(intentId: string): Promise<CurrentNotificationIntent | undefined>;

  /**
   * `PENDING → PROCESSING`, guarded by the from-state.
   *
   * Returns whether this call performed the transition. `false` means the intent
   * was already `PROCESSING` — normal under at-least-once delivery — and is not
   * an error.
   */
  beginProcessing(intentId: string): Promise<boolean>;

  /** The attempt row and the intent's resulting state, atomically. @requiresTransaction */
  settleAttempt(input: SettleAttemptInput): Promise<void>;
}

export const NOTIFICATION_DELIVERY_REPOSITORY = Symbol('NOTIFICATION_DELIVERY_REPOSITORY');

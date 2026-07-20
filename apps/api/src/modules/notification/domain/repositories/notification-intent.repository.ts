/**
 * AGG-22 Notification Intent persistence contract (TBL-070, TBL-071).
 *
 * An intent is a **decision to notify**, not a message: the row holds a
 * template reference and redacted parameters, never a rendered body and never
 * a secret (ADR-DB2-003). The recipient is stored masked.
 *
 * Carries **G-DB7-48** and **G-DB7-49** — two intentional no-FK references
 * (DEV-DB6-016) — and **G-DB7-58** (claim, attempt, settle).
 *
 * **No exactly-once claim is made.** DB7 implements the claim path and proves
 * it single-run; multi-worker exclusivity is DB8.
 */
import type { NotificationDeliveryOutcome, NotificationIntentState } from '@embroidery/database';

export type IntentId = string & { readonly __brand: 'IntentId' };

export interface NotificationIntent {
  readonly id: IntentId;
  readonly intentKey: string;
  readonly templateKey: string;
  readonly channel: string;
  readonly recipientMasked: string;
  readonly status: NotificationIntentState;
  readonly correlationId: string;
}

export interface CreateIntentInput {
  readonly id: IntentId;
  /** The dedup key: one intent per logical decision (GRD-012-class). */
  readonly intentKey: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly channel: string;
  /**
   * Optional contact point (G-DB7-48). No FK backs it — an intent may target an
   * address that is not yet a contact point — so the application resolves it
   * when present and rejects an id that does not exist.
   */
  readonly recipientContactPointId?: string | undefined;
  /** Masked for storage: the full address never enters this table. */
  readonly recipientMasked: string;
  /** Redacted already: no PII beyond what the template needs. */
  readonly params: Record<string, unknown>;
  /**
   * Optional originating outbox event (G-DB7-49). No FK: outbox rows are
   * TTL-cleaned, and a FK would block that cleanup. Resolved at creation only;
   * a later-missing row is permitted and documented.
   */
  readonly sourceOutboxEventId?: bigint | undefined;
  readonly correlationId: string;
}

/** A duplicate intent key is a replay, not a failure. */
export type CreateIntentOutcome =
  | { readonly outcome: 'created'; readonly intent: NotificationIntent }
  | { readonly outcome: 'replay'; readonly intent: NotificationIntent };

export const NOTIFICATION_INTENT_REPOSITORY = Symbol('NOTIFICATION_INTENT_REPOSITORY');

export interface NotificationIntentRepository {
  /** @requiresTransaction — idempotent on `intentKey`. */
  createIdempotent(input: CreateIntentInput): Promise<CreateIntentOutcome>;

  /**
   * Claims a batch of pending intents for one worker.
   *
   * `FOR UPDATE SKIP LOCKED` per ADR-DB5-003. Single-run only.
   *
   * @requiresTransaction
   */
  claimBatch(limit: number): Promise<NotificationIntent[]>;

  /** @requiresTransaction — append-only delivery evidence. */
  recordAttempt(input: {
    intentId: IntentId;
    channel: string;
    outcome: NotificationDeliveryOutcome;
    providerMessageRef?: string | undefined;
    /** A stable error **class**, never a provider body: this is read by operators. */
    errorClass?: string | undefined;
    attemptedAt: Date;
  }): Promise<void>;

  /** @requiresTransaction */
  markDelivered(id: IntentId): Promise<void>;

  /** @requiresTransaction */
  markFailed(id: IntentId): Promise<void>;

  findByIntentKey(intentKey: string): Promise<NotificationIntent | undefined>;
  countAttempts(id: IntentId): Promise<number>;
}

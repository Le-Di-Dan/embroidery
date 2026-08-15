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

/**
 * What an operator may see of an intent, and what a replay needs to copy
 * (`APP4-B08`).
 *
 * A wider read model than {@link NotificationIntent}, which exists for the
 * delivery path and carries only what a worker needs. This one adds the facts a
 * support screen answers with — the template version, the creation instant — and
 * the two a replay copies forward: `params` and `recipientContactPointId`.
 *
 * `params` is on this type and **not** on {@link NotificationIntent} on purpose.
 * It is secret-free by construction (`buildIntentParams` writes a closed
 * discriminated union and nothing else), but it is still the only field a future
 * edit could put a business identifier into, so it is exposed exactly where it
 * is needed — the replay copy and the eligibility lookup — and nowhere else. It
 * is **never** projected into an HTTP response.
 *
 * There is deliberately no envelope, no ciphertext and no outbox payload here:
 * the intent row has never held any of them.
 */
export interface NotificationIntentRecord {
  readonly id: IntentId;
  readonly intentKey: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly channel: string;
  readonly recipientContactPointId: string | undefined;
  readonly recipientMasked: string;
  readonly params: Record<string, unknown>;
  readonly status: NotificationIntentState;
  readonly sourceOutboxEventId: bigint | undefined;
  readonly correlationId: string;
  readonly createdAt: Date;
}

/**
 * One delivery attempt, as an operator may see it (`APP4-B08`).
 *
 * Three safe facts. `provider_message_ref` exists on the table and is
 * deliberately absent here: APP4 has no real provider — `APP4-W01` ships only
 * the recording adapter — so the column is always null, and publishing a field
 * that is always empty invites a later reader to fill it with a provider body.
 * The `error_class` is a bounded class the worker chose, never an exception
 * message.
 */
export interface NotificationDeliveryAttemptRecord {
  readonly attemptedAt: Date;
  readonly channel: string;
  readonly outcome: NotificationDeliveryOutcome;
  readonly errorClass: string | undefined;
}

/** The Admin list filter. One closed-set status, and nothing else. */
export interface AdminIntentListFilter {
  readonly status?: NotificationIntentState | undefined;
  readonly limit: number;
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

  /**
   * The Admin support list (`APP4-B08`).
   *
   * Optionally filtered by one persisted lifecycle state, newest first, bounded
   * by the caller's limit. There is deliberately no recipient, customer,
   * template or free-text search parameter: the masked recipient exists so an
   * operator can *recognise* a destination, and making it searchable would turn
   * a support screen into a contact-lookup oracle — the exact outcome masking
   * was introduced to prevent (`ADR-APP4-001` §2.3).
   */
  listForAdmin(filter: AdminIntentListFilter): Promise<NotificationIntentRecord[]>;

  /** One intent, by id. Read-only, no lock. */
  findById(id: IntentId): Promise<NotificationIntentRecord | undefined>;

  /**
   * Locks one intent for the replay transaction (`APP4-B08`).
   *
   * `FOR UPDATE`, not `SKIP LOCKED`: two concurrent Admin replays of the same
   * intent must **serialize**, not both proceed. The second waits, then re-reads
   * the row the first committed and finds the replay already exists. Skipping
   * would let both callers believe they were the only one and append two
   * deliveries for one operator decision.
   *
   * @requiresTransaction — the lock lives only as long as the transaction.
   */
  lockById(id: IntentId): Promise<NotificationIntentRecord | undefined>;

  /**
   * The attempt timeline for one intent (`APP4-B08`).
   *
   * Chronological by `attempted_at`, with the append-only row identity as the
   * tie-breaker so two attempts recorded in the same millisecond still render in
   * the order they were written. No display ordinal is persisted — a counter
   * column would be a second source of truth for something the ordering already
   * says.
   */
  listAttempts(id: IntentId): Promise<NotificationDeliveryAttemptRecord[]>;
}

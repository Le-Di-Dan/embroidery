/**
 * What the Admin notification delivery list returns (`APP4-B08` §10).
 *
 * Seven fields per intent, three per attempt, and the absences are the contract.
 *
 * **No recipient beyond the mask.** Not the raw address, not the normalized one,
 * not the contact-point id, and no join to `customer_contact_points` to fetch a
 * prettier destination. `recipient_masked` was frozen at intake by the P01
 * masker precisely so a support screen could exist without becoming a contact
 * database (`ADR-APP4-001` §2.3).
 *
 * **No `params`.** It is secret-free by construction, and it is still a business
 * identifier for a challenge or a grant. An operator answering "was it sent?"
 * does not need one, and publishing it would put a challenge id on a screen from
 * which the next reasonable request is a lookup by it.
 *
 * **No envelope, ciphertext, IV, auth tag or outbox payload.** The API never
 * opens one, so there is nothing to publish; a field for it here would be the
 * reason someone later added the decrypt.
 *
 * **No provider body, no exception message, no stack.** `errorClass` is a
 * bounded class the worker chose. A provider response can quote the recipient
 * and, on some transports, the message itself.
 *
 * **No `providerMessageRef`.** APP4 ships only the recording adapter, so the
 * column is always null; a field that never carries anything is an invitation to
 * fill it with a provider body later.
 *
 * **No retry scheduler internals.** `next_attempt_at`, `claimed_by`,
 * `attempt_count` and the background-job identity are worker state, not delivery
 * evidence.
 *
 * **No `canReplay`.** Eligibility depends on the underlying challenge or grant
 * still being live, which this read does not check. A flag computed from status
 * alone would be a confident lie on exactly the rows an operator cares about.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { NotificationDeliveryOutcome, NotificationIntentState } from '@embroidery/database';

const INTENT_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';

/**
 * The published lifecycle and outcome sets.
 *
 * Declared here rather than imported as values, following the rule
 * `secure-link-resolution.response.ts` records: the schema package re-exports
 * its unions as **types only**, so a presentation file cannot take the runtime
 * tuple without pulling an ORM value into the API's domain-facing layer. The
 * `satisfies` clauses and the two completeness proofs tie both directions to the
 * canonical unions, so neither an invented member nor a forgotten one compiles.
 */
export const PUBLISHED_INTENT_STATES = [
  'PENDING',
  'PROCESSING',
  'SATISFIED',
  'FAILED',
  'CANCELLED',
] as const satisfies readonly NotificationIntentState[];

const PUBLISHED_OUTCOMES = [
  'DELIVERED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
] as const satisfies readonly NotificationDeliveryOutcome[];

/** Compile-time proof neither published list omits a canonical member. */
export type PublishedIntentStatesAreComplete =
  Exclude<NotificationIntentState, (typeof PUBLISHED_INTENT_STATES)[number]> extends never
    ? true
    : never;
export type PublishedOutcomesAreComplete =
  Exclude<NotificationDeliveryOutcome, (typeof PUBLISHED_OUTCOMES)[number]> extends never
    ? true
    : never;

export class AdminNotificationAttemptResponse {
  @ApiProperty({
    format: 'date-time',
    example: '2026-08-15T09:00:00.000Z',
    description: 'When this delivery attempt was made.',
  })
  attemptedAt!: string;

  @ApiProperty({ example: 'EMAIL', description: 'The transport this attempt used.' })
  channel!: string;

  @ApiProperty({
    enum: PUBLISHED_OUTCOMES,
    example: 'FAILED_TERMINAL',
    description:
      'What happened. `FAILED_RETRYABLE` was followed by an automatic retry; ' +
      '`FAILED_TERMINAL` was not, and is what leaves the notification in FAILED.',
  })
  outcome!: NotificationDeliveryOutcome;

  @ApiProperty({
    required: false,
    example: 'CHANNEL_UNAVAILABLE',
    description:
      'A bounded failure class, present on a failed attempt. Never a provider response body, ' +
      'an exception message or a stack trace — those can quote the recipient or the message.',
  })
  errorClass?: string;
}

export class AdminNotificationIntentResponse {
  @ApiProperty({ example: INTENT_ID_EXAMPLE, description: 'The notification intent.' })
  intentId!: string;

  @ApiProperty({
    enum: PUBLISHED_INTENT_STATES,
    example: 'FAILED',
    description:
      'The persisted lifecycle state. FAILED is terminal — it is never reopened; a manual ' +
      'replay creates a new notification instead. Only a FAILED notification can be replayed, ' +
      'and whether it actually can depends on the code or link behind it still being valid.',
  })
  status!: NotificationIntentState;

  @ApiProperty({ example: 'EMAIL', description: 'The transport this notification uses.' })
  channel!: string;

  @ApiProperty({
    example: 'b***@vidu.com',
    description:
      'The masked destination, and the only form of it this API publishes. Frozen when the ' +
      'notification was created; never re-derived from a contact record.',
  })
  recipientMasked!: string;

  @ApiProperty({ example: 'verification.code', description: 'Which template was used.' })
  templateKey!: string;

  @ApiProperty({ example: 1, description: 'The template version used.' })
  templateVersion!: number;

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-15T09:00:00.000Z',
    description: 'When the decision to notify was recorded.',
  })
  createdAt!: string;

  @ApiProperty({
    type: [AdminNotificationAttemptResponse],
    description: 'Every delivery attempt, oldest first. Append-only evidence.',
  })
  attempts!: AdminNotificationAttemptResponse[];
}

export class AdminNotificationIntentListResponse {
  @ApiProperty({
    type: [AdminNotificationIntentResponse],
    description: 'One bounded page of notifications, newest first.',
  })
  intents!: AdminNotificationIntentResponse[];
}

/**
 * The two things a replay can have been.
 *
 * Published under the Product Owner's `APP4-A01` ruling. The use case has always
 * known which of these happened — the idempotent create returns it — and the
 * response used to drop it on the reasoning that idempotency is an
 * implementation detail. `APP4-A01` showed it is not: the approved support
 * design has two distinct states, one telling the operator the replay is on its
 * way and one telling them their click resolved onto a replay that already
 * existed and created nothing. Without this field a screen can only guess, and
 * the guesses available — elapsed time, a remembered id, the PENDING status —
 * are all wrong for the concurrent case, where another operator raised the
 * replay and this session never saw it.
 *
 * It is operational metadata about *this call*, not about the customer, the
 * message or the secret: it says whether a row was inserted, which the caller
 * would learn anyway by watching the list.
 */
export const REPLAY_OUTCOMES = ['CREATED', 'EXISTING'] as const;

export type ReplayOutcome = (typeof REPLAY_OUTCOMES)[number];

/**
 * What a manual replay returns.
 *
 * The new notification's id, its state and whether this call created it —
 * nothing else. No ciphertext, no source payload, no params, no recipient, no
 * code or token, no digest and no attempt-budget internals: a mutation response
 * is one more place a credential could appear, so it carries the three facts the
 * operator needs to follow the replay and stops.
 */
export class NotificationReplayResponse {
  @ApiProperty({
    example: INTENT_ID_EXAMPLE,
    description:
      'The new notification created for this replay. The original stays FAILED and is not ' +
      'reopened; this is the record that will be delivered.',
  })
  replayIntentId!: string;

  @ApiProperty({
    enum: ['PENDING'],
    example: 'PENDING',
    description: 'The replay is queued. A worker picks it up with a fresh attempt budget.',
  })
  status!: 'PENDING';

  @ApiProperty({
    enum: REPLAY_OUTCOMES,
    example: 'CREATED',
    description:
      'Whether this call created the replay. `CREATED` — it did, and `replayIntentId` names a ' +
      'notification that did not exist a moment ago. `EXISTING` — an identical replay of the ' +
      'same failed delivery was already queued, by an earlier click or by another operator at ' +
      'the same moment, and this call resolved onto it without creating a second. Both mean ' +
      'exactly one replay is queued, and neither means anything was delivered: the worker ' +
      'owns that, and the attempt timeline is where it shows up.',
  })
  outcome!: ReplayOutcome;
}

/** The serialized projections. The only place these instants become strings. */
export interface AdminNotificationIntentListPayload {
  readonly intents: readonly {
    readonly intentId: string;
    readonly status: NotificationIntentState;
    readonly channel: string;
    readonly recipientMasked: string;
    readonly templateKey: string;
    readonly templateVersion: number;
    readonly createdAt: string;
    readonly attempts: readonly {
      readonly attemptedAt: string;
      readonly channel: string;
      readonly outcome: NotificationDeliveryOutcome;
      readonly errorClass?: string;
    }[];
  }[];
}

export interface NotificationReplayPayload {
  readonly replayIntentId: string;
  readonly status: 'PENDING';
  readonly outcome: ReplayOutcome;
}

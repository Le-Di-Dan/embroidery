/**
 * Admin manual transport replay (`APP4-B08`, IMP-D049 PO-10/PO-11,
 * `APP4_PHASE_ENTRY_AUDIT` §C.8).
 *
 * One operator action, one transaction, and two records that are never touched.
 *
 * ### Nothing terminal is reopened
 *
 * The origin intent stays `FAILED` and the origin outbox row stays
 * `DEAD_LETTER`. That is not conservatism, it is the only form that works:
 *
 * - DB3 §1 declares `FAILED` terminal and enumerates six transitions, none of
 *   which is `FAILED → PENDING`; §3 rule 2 prescribes "manual resend = **new
 *   intent**, không reopen intent cũ".
 * - The retry budget derives from `countAttempts(intentId)`, so a reopened
 *   intent would re-enter delivery already at its limit and terminal-fail on the
 *   first attempt — the replay would never deliver.
 * - `job_key` **is** the outbox event id
 *   (`worker-job-queue.repository.ts`), so re-leasing the old row would collide
 *   with CST-049 `uq_background_job_attempts__kind_key_attempt` and destroy the
 *   monotonicity of `(job_kind, job_key, attempt_no)`.
 *
 * A new intent gets a clean budget and a new event id gives the worker a new
 * `job_key`. Neither counter is written by hand anywhere in this file.
 *
 * ### The envelope is copied, never opened
 *
 * The source payload is read as an opaque value and handed straight to
 * `append`. This module imports nothing from `@embroidery/notification-delivery`
 * — not `openDeliveryEnvelope`, not `sealDeliveryEnvelope`, not the codec — so
 * there is no code path here that could decrypt, re-render or re-seal. The
 * secret inside is the customer's original one, and it stays sealed for the
 * whole of this transaction.
 *
 * A consequence worth stating: the copied ciphertext still carries
 * `originNotificationIntentId` naming the *original* intent, while the new
 * event's `aggregate_id` names the replay intent. They diverge on purpose
 * (IMP-D049 PO-08) — the encrypted one is lineage, the linkage is execution
 * identity, and `APP4-W01` reads only the latter.
 *
 * ### Duplicates collapse on a key, not on a lock
 *
 * The replay `intent_key` is a deterministic digest of the origin intent and the
 * dead-letter event (PO-11), so two operators clicking the same button derive
 * the same key and the second one's `createIdempotent` returns `replay`. The row
 * lock below is what makes that *observable* rather than racy: both callers
 * serialize on the origin intent, so the loser reads the committed replay
 * instead of racing to insert its own. There is no new idempotency table and no
 * in-memory mutex.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { OutboxEventStore, TransactionManager } from '@embroidery/persistence';

import { RequestContextService } from '../../../platform/request-context/request-context.service';
import { readNotificationReference } from '../domain/replay/replay-reference';
import { deriveManualReplayIntentKey } from '../domain/replay/manual-replay-key';
import { ManualReplayError } from '../domain/replay/manual-replay.errors';
import {
  NOTIFICATION_INTENT_REPOSITORY,
  type IntentId,
  type NotificationIntentRecord,
  type NotificationIntentRepository,
} from '../domain/repositories/notification-intent.repository';
import { NOTIFICATION_DELIVERY_EVENT_TYPE } from './request-notification.use-case';
import { NotificationReplayAuditRecorder } from './notification-replay-audit.recorder';
import { ReplayEligibilityResolver } from './replay-eligibility.resolver';

/** The only intent state a terminal transport failure can be in. */
const TERMINAL_FAILED = 'FAILED';

export interface ReplayNotificationDeliveryCommand {
  readonly intentId: IntentId;
}

export interface ReplayNotificationDeliveryResult {
  readonly replayIntentId: IntentId;
  readonly status: 'PENDING';
  /** `false` when an identical replay already existed and was returned instead. */
  readonly created: boolean;
}

@Injectable()
export class ReplayNotificationDeliveryUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(NOTIFICATION_INTENT_REPOSITORY)
    private readonly intents: NotificationIntentRepository,
    private readonly outbox: OutboxEventStore,
    private readonly eligibility: ReplayEligibilityResolver,
    private readonly audit: NotificationReplayAuditRecorder,
    private readonly requestContext: RequestContextService,
  ) {}

  async replay(
    command: ReplayNotificationDeliveryCommand,
  ): Promise<ReplayNotificationDeliveryResult> {
    return this.transactions.runInTransaction(async () => {
      // 1–2. Lock first, then judge. `FOR UPDATE` without `SKIP LOCKED`, so a
      // concurrent replay of the same intent waits here and later reads what
      // this one committed rather than deciding in parallel.
      const origin = await this.intents.lockById(command.intentId);
      if (origin === undefined) {
        throw new ManualReplayError('INTENT_NOT_FOUND');
      }
      if (origin.status !== TERMINAL_FAILED) {
        // Not a secret problem — a state one. `REISSUE_REQUIRED` here would tell
        // an operator to mint a new credential for a customer who may already
        // have received the first.
        throw new ManualReplayError('REPLAY_NOT_APPLICABLE');
      }

      const source = await this.resolveSourceEvent(origin);

      // 7. The copied secret must still be usable, or re-sending it helps nobody.
      const reference = readNotificationReference(origin.params);
      if (reference === undefined) {
        // Malformed persistence, not an expired secret. Deliberately not
        // `REISSUE_REQUIRED`: issuing a real credential to paper over a bad row
        // is worse than refusing.
        throw new ManualReplayError('REPLAY_SOURCE_UNAVAILABLE');
      }
      if (!(await this.eligibility.isReplayable(reference))) {
        throw new ManualReplayError('REISSUE_REQUIRED');
      }

      // 8–9. The deterministic key is the whole of the idempotency.
      const created = await this.intents.createIdempotent({
        id: newId() as IntentId,
        intentKey: deriveManualReplayIntentKey({
          originNotificationIntentId: origin.id,
          deadLetterOutboxEventId: source.id,
        }),
        templateKey: origin.templateKey,
        templateVersion: origin.templateVersion,
        channel: origin.channel,
        ...(origin.recipientContactPointId === undefined
          ? {}
          : { recipientContactPointId: origin.recipientContactPointId }),
        // The frozen mask, copied. Nothing here re-derives it from a contact
        // row: the destination is inside the sealed envelope and this process
        // never learns it.
        recipientMasked: origin.recipientMasked,
        // Secret-free by construction, and copied rather than rebuilt so the
        // replay points at exactly the business object the original did.
        params: origin.params,
        // The non-secret replay origin trace (G-DB7-49). It names the terminal
        // event this delivery descends from, which is also what the replay key
        // was derived over.
        sourceOutboxEventId: source.id,
        // This request created this intent; that is the truthful correlation.
        correlationId: this.requestContext.requireRequestId(),
      });

      if (created.outcome === 'replay') {
        // A duplicate. Return before anything is appended or audited: a second
        // outbox event would be a second delivery for one operator decision, and
        // a second audit row would claim a replay that did not happen.
        return {
          replayIntentId: created.intent.id,
          status: 'PENDING' as const,
          created: false,
        };
      }

      // 12–15. One new event, linked to the **new** intent, carrying the source
      // payload verbatim. `payload` crosses this boundary as an opaque value and
      // is never inspected, parsed or re-shaped.
      await this.outbox.append({
        eventType: NOTIFICATION_DELIVERY_EVENT_TYPE,
        aggregateKind: 'NOTIFICATION_INTENT',
        aggregateId: created.intent.id,
        payload: source.payload,
        payloadSchemaVersion: source.payloadSchemaVersion,
      });

      // 16. Evidence commits with the replay or not at all.
      await this.audit.recordReplayed({
        originIntentId: origin.id,
        replayIntentId: created.intent.id,
        sourceOutboxEventId: source.id,
      });

      return { replayIntentId: created.intent.id, status: 'PENDING' as const, created: true };
    });
  }

  /**
   * The terminal delivery event this replay descends from.
   *
   * Found through the non-secret REL-104 linkage — `aggregate_kind`,
   * `aggregate_id`, event type, status — and never by looking inside `payload`.
   * ADR-DB4-004 rule 5 forbids querying JSONB internals, and the only intent
   * reference the payload holds is encrypted lineage, so a content lookup would
   * require the API to decrypt.
   *
   * Fails closed on zero **and** on more than one. Zero means the intent failed
   * without an exhausted delivery event, which is not a state B08 can replay;
   * more than one means the repository's invariants are not what this code
   * believes, and picking one would be a persistence adapter deciding which
   * credential to re-send.
   */
  private async resolveSourceEvent(origin: NotificationIntentRecord): Promise<{
    readonly id: bigint;
    readonly payload: Record<string, unknown>;
    readonly payloadSchemaVersion: number;
  }> {
    const terminal = await this.outbox.listTerminalEventsForAggregate(
      'NOTIFICATION_INTENT',
      origin.id,
      NOTIFICATION_DELIVERY_EVENT_TYPE,
    );

    const [source] = terminal;
    if (terminal.length !== 1 || source === undefined) {
      throw new ManualReplayError('REPLAY_SOURCE_UNAVAILABLE');
    }
    if (!isPayloadObject(source.payload)) {
      throw new ManualReplayError('REPLAY_SOURCE_UNAVAILABLE');
    }

    return {
      id: source.id,
      payload: source.payload,
      payloadSchemaVersion: source.payloadSchemaVersion,
    };
  }
}

/**
 * The narrowest possible check on the copied payload.
 *
 * It asserts the value is a JSON object, because `append` accepts a record —
 * and nothing else. It deliberately does not look at `version`, `algorithm`,
 * `iv`, `ciphertext` or `authTag`: validating the envelope's shape here would
 * make this module a second authority on a format
 * `@embroidery/notification-delivery` owns, and would be the first step toward
 * reading its contents.
 */
function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

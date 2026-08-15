/**
 * The durable evidence an Admin manual transport replay leaves (`APP4-B08`
 * §26, `INV-14`).
 *
 * One action, one target kind, and one hard rule about the summary.
 *
 * ### What may never appear here
 *
 * The envelope in any form — ciphertext, IV, auth tag, `payload_schema_version`
 * is fine but the payload is not — the recipient full, normalized or masked, the
 * template body, the referenced code or token, and either digest.
 *
 * The masked recipient deserves the explicit mention, because it is the one that
 * looks safe. It is safe *on a support screen an operator already opened for
 * that customer*; in `audit_events` it is different, because that table outlives
 * the intent it describes by design (G-DB7-46). An audit trail accumulating
 * masked destinations becomes a contact-adjacent dataset with a retention rule
 * nobody chose.
 *
 * What is left is exactly what an operator needs and an attacker cannot use:
 * three server-generated ids and the fixed operation name.
 *
 * ### The actor is the Admin, and there is no fallback
 *
 * Replay is only ever operator-initiated — there is no automatic path to this
 * code — so unlike `SecureGrantAuditRecorder`, which serves both a customer flow
 * and an Admin one, this recorder admits no other actor. An unattributable
 * replay fails rather than being filed against `SYSTEM`.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { IntentId } from '../domain/repositories/notification-intent.repository';

/** Already in the closed `AUDIT_TARGET_KINDS` set — DB7 put it there. */
const INTENT_KIND = 'NOTIFICATION_INTENT' as const;

/** An operator re-sent an existing sealed secret through a new delivery. */
export const NOTIFICATION_REPLAYED_ACTION = 'notification.delivery.replayed';

/**
 * The fixed operation class, so the trail distinguishes this from an automatic
 * transport retry and from a business resend without a reader having to infer
 * it (IMP-D049 PO-10 — three contracts, three names, never interchangeable).
 */
export const MANUAL_TRANSPORT_REPLAY = 'MANUAL_TRANSPORT_REPLAY';

export interface RecordReplayInput {
  readonly originIntentId: IntentId;
  readonly replayIntentId: IntentId;
  readonly sourceOutboxEventId: bigint;
}

@Injectable()
export class NotificationReplayAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /**
   * @requiresTransaction — must commit with the replay it describes, or not at
   * all. An audit row for a replay that rolled back would be a false record.
   *
   * The **target is the origin intent**, not the replay. An operator
   * investigating "what happened to this failed notification?" looks it up by
   * the id they were given, and the replay's id is in the summary where it reads
   * as a consequence rather than as the subject.
   */
  async recordReplayed(input: RecordReplayInput): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentAdminActor(),
      action: NOTIFICATION_REPLAYED_ACTION,
      targetKind: INTENT_KIND,
      targetId: input.originIntentId,
      summary: {
        operation: MANUAL_TRANSPORT_REPLAY,
        replayIntentId: input.replayIntentId,
        sourceOutboxEventId: input.sourceOutboxEventId.toString(),
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The acting Admin, taken from the bound request actor.
   *
   * Never from the request body — an accepted actor id would let an operator
   * file a re-delivery against a colleague — and with no fallback, because a
   * replay that cannot be attributed must fail rather than be recorded as an
   * automated job that does not exist.
   */
  private currentAdminActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      // `AuthenticatedAdminGuard` binds this actor and admits nobody else, so
      // this is unreachable through HTTP. It stays a hard stop rather than a
      // silent coercion to SYSTEM.
      throw new Error('Recording a manual replay requires an authenticated Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}

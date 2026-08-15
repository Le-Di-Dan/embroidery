/**
 * Notification intent intake (`APP4-B01`, `ADR-APP4-001` §6, §7; audit §C.8).
 *
 * One logical decision to notify becomes, atomically, one notification intent
 * and one `PENDING` delivery outbox event. There is no dual write: both happen
 * inside `TransactionManager.runInTransaction`, so either the intent and its
 * delivery event both commit or neither does — the same shape
 * `upload-transactions.service.ts` uses for asset inspection.
 *
 * Four rules this class exists to hold:
 *
 * 1. **The intent is secret-free.** `params` is built from a closed reference
 *    union, `recipient_masked` comes from the P01 masker, and the raw code or
 *    token reaches only the sealed envelope.
 * 2. **The envelope is sealed, never opened.** This module imports
 *    `sealDeliveryEnvelope` and deliberately not `openDeliveryEnvelope`:
 *    decryption belongs to the worker after it has claimed the job.
 * 3. **The outbox carries the current intent id in the clear.** A worker finds
 *    its intent through `aggregate_id`, so it never has to decrypt to know what
 *    it is working on and nothing ever queries ciphertext.
 * 4. **A duplicate seals nothing.** On `replay` the method returns before any
 *    envelope is built and before any event is appended, so a repeated request
 *    cannot produce a second delivery for the same decision.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { OutboxEventStore, TransactionManager } from '@embroidery/persistence';
import { DELIVERY_ENVELOPE_VERSION, sealDeliveryEnvelope } from '@embroidery/notification-delivery';

import { maskContact } from '../../customer/domain/contact/mask-contact';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import { DeliveryEnvelopeKeyProvider } from '../config/delivery-envelope-key.provider';
import { deriveNotificationIntentKey } from '../domain/notification-intent-key';
import {
  buildIntentParams,
  type NotificationRequest,
  type NotificationRequestResult,
} from '../domain/notification-request';
import {
  NOTIFICATION_INTENT_REPOSITORY,
  type IntentId,
  type NotificationIntentRepository,
} from '../domain/repositories/notification-intent.repository';

/** The one delivery event type APP4 appends. `APP4-W01` handles exactly this. */
export const NOTIFICATION_DELIVERY_EVENT_TYPE = 'notification.delivery.requested';

@Injectable()
export class RequestNotificationUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(NOTIFICATION_INTENT_REPOSITORY)
    private readonly intents: NotificationIntentRepository,
    private readonly outbox: OutboxEventStore,
    private readonly envelopeKey: DeliveryEnvelopeKeyProvider,
    private readonly requestContext: RequestContextService,
  ) {}

  async request(input: NotificationRequest): Promise<NotificationRequestResult> {
    const intentKey = deriveNotificationIntentKey({
      sourceEventId: input.sourceEventId,
      normalizedRecipient: input.normalizedRecipient,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
    });
    // Masked here, by the P01 authority, so no second masking rule can exist.
    const recipientMasked = maskContact(input.contactKind, input.normalizedRecipient);
    const correlationId = input.correlationId ?? this.requestContext.requireRequestId();

    return this.transactions.runInTransaction(async () => {
      const created = await this.intents.createIdempotent({
        id: newId() as IntentId,
        intentKey,
        templateKey: input.templateKey,
        templateVersion: input.templateVersion,
        channel: input.channel,
        // Passed straight through to the existing optional column and used for
        // nothing else here. It is deliberately absent from `intentKey` above —
        // the idempotency tuple is the business decision, and adding an
        // ownership reference to it would make the same decision resolve to two
        // intents once a caller learned the contact point. It is equally absent
        // from `params` and from the sealed envelope below.
        ...(input.recipientContactPointId === undefined
          ? {}
          : { recipientContactPointId: input.recipientContactPointId }),
        recipientMasked,
        params: buildIntentParams(input.reference),
        correlationId,
      });

      // The duplicate path: the decision already exists, so nothing is sealed
      // and nothing is appended. Idempotency is the repository's `intent_key`
      // uniqueness, never a comparison of secrets.
      if (created.outcome === 'replay') {
        return { outcome: 'replay', intentId: created.intent.id, intentKey };
      }

      const envelope = sealDeliveryEnvelope(this.envelopeKey.require(), {
        secretKind: input.secretKind,
        // Lineage, not execution identity: on a B08 replay this keeps naming
        // the original intent while the new event's linkage names the new one.
        originNotificationIntentId: created.intent.id,
        channel: input.channel,
        normalizedRecipient: input.normalizedRecipient,
        secret: input.secret,
        issuedAt: input.issuedAt.toISOString(),
        expiresAt: input.expiresAt.toISOString(),
      });

      const outboxEventId = await this.outbox.append({
        eventType: NOTIFICATION_DELIVERY_EVENT_TYPE,
        aggregateKind: 'NOTIFICATION_INTENT',
        // The current intent, in the clear. This is what the worker reads.
        aggregateId: created.intent.id,
        payload: envelope,
        payloadSchemaVersion: DELIVERY_ENVELOPE_VERSION,
      });

      return { outcome: 'created', intentId: created.intent.id, intentKey, outboxEventId };
    });
  }
}

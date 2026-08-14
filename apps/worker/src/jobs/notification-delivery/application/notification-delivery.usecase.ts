/**
 * One notification delivery try, start to finish (`APP4-W01`).
 *
 * The order of the steps below is the security model, not a style:
 *
 *  1. the runtime has already claimed the outbox row, under a lease;
 *  2. the **current** intent is resolved from the row's aggregate linkage —
 *     a relational column, never the ciphertext (`ADR-APP4-001` §7);
 *  3. an already-settled intent short-circuits, so a replayed claim sends
 *     nothing and writes nothing;
 *  4. only then is the envelope opened.
 *
 * Reordering 3 and 4 would decrypt a secret to discover there was no work, and
 * reordering 2 and 4 would mean reading the payload to find out what the job is
 * about — which is exactly how `originNotificationIntentId` gets mistaken for the
 * execution target and stays right until the first `APP4-B08` replay (§6.5).
 *
 * The plaintext lives in one `const` inside {@link send} and is handed to the
 * channel port field by field. It is never returned, never logged, never put in
 * an error, and never written to a column. Every failure that leaves this class
 * carries a bounded class and nothing else.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';
import { openDeliveryEnvelope, type DeliveryEnvelope } from '@embroidery/notification-delivery';

import { WorkerDeliveryEnvelopeKeyProvider } from '../config/delivery-envelope-key.provider';
import {
  NOTIFICATION_CHANNEL_PORT,
  isNotificationChannel,
  type DeliveryResult,
  type NotificationChannel,
  type NotificationChannelPort,
} from '../domain/channel/notification-channel.port';
import { NotificationDeliveryError } from '../domain/delivery-failure';
import type { NotificationDeliveryFailure } from '../domain/delivery-failure';
import type { NotificationDeliveryPolicy } from '../domain/notification-delivery-policy';
import {
  NOTIFICATION_DELIVERY_REPOSITORY,
  TERMINAL_INTENT_STATUSES,
  type CurrentNotificationIntent,
  type NotificationDeliveryOutcome,
  type NotificationDeliveryRepository,
} from '../domain/repositories/notification-delivery.repository';
import { NotificationDeliveryPolicyService } from '../infrastructure/policy/notification-delivery-policy.service';

export interface DeliveryRequest {
  /** The current intent id, from `outbox_events.aggregate_id`. */
  readonly intentId: string;
  readonly envelope: DeliveryEnvelope;
  /** The runtime's attempt number for this outbox row. */
  readonly attemptNo: number;
}

@Injectable()
export class NotificationDeliveryUseCase {
  private readonly logger = new Logger(NotificationDeliveryUseCase.name);

  constructor(
    private readonly transactions: TransactionManager,
    @Inject(NOTIFICATION_DELIVERY_REPOSITORY)
    private readonly intents: NotificationDeliveryRepository,
    @Inject(NOTIFICATION_CHANNEL_PORT)
    private readonly channel: NotificationChannelPort,
    private readonly policies: NotificationDeliveryPolicyService,
    private readonly envelopeKey: WorkerDeliveryEnvelopeKeyProvider,
  ) {}

  async deliver(request: DeliveryRequest): Promise<void> {
    // Fail closed before anything else: with no published budget there is no
    // safe number of sends, so there is no send. Retryable, so the secret waits
    // for an operator rather than dead-lettering on a configuration gap.
    const policy = this.policies.require();

    const intent = await this.intents.findIntent(request.intentId);
    if (intent === undefined) {
      // No row, so no attempt evidence is even representable (REL-100). The
      // linkage naming an intent that does not exist is a producer defect, not
      // a transport problem, and repeating it would not create the row.
      throw new NotificationDeliveryError('NOTIFICATION_INTENT_UNRESOLVABLE');
    }

    if (TERMINAL_INTENT_STATUSES.includes(intent.status)) {
      // The at-least-once safety boundary. A reclaimed or replayed job whose
      // intent already reached a terminal state performs no second send, opens
      // no envelope and appends no attempt — it reports success so the outbox
      // row completes normally.
      this.logger.log(
        `Notification intent is already ${intent.status}; delivery is a no-op ` +
          `(attempt ${String(request.attemptNo)}).`,
      );
      return;
    }

    await this.attempt(request, intent, policy);
  }

  /** The opening, validation and send path, in that order. */
  private async attempt(
    request: DeliveryRequest,
    intent: CurrentNotificationIntent,
    policy: NotificationDeliveryPolicy,
  ): Promise<void> {
    const lastAttempt = request.attemptNo >= policy.maxAttempts;

    let opened: OpenedDelivery;
    try {
      opened = this.open(request.envelope, intent);
    } catch (error: unknown) {
      // The cause is dropped here rather than wrapped. A GCM authentication
      // failure, a JSON parse error and a malformed payload all carry fragments
      // of material this path must not propagate, and none of them changes what
      // happens next.
      const failure =
        error instanceof NotificationDeliveryError
          ? error.failure
          : ('NOTIFICATION_ENVELOPE_UNREADABLE' as const);
      await this.settle(intent, intent.channel, 'FAILED_TERMINAL', failure, 'FAILED');
      throw new NotificationDeliveryError(failure);
    }

    await this.intents.beginProcessing(intent.id);
    const result = await this.send(opened);

    if (result.outcome === 'SENT') {
      await this.settle(intent, opened.channel, 'DELIVERED', undefined, 'SATISFIED');
      return;
    }

    const failure: NotificationDeliveryFailure = result.retryable
      ? 'NOTIFICATION_TRANSPORT_UNAVAILABLE'
      : 'NOTIFICATION_TRANSPORT_REJECTED';
    const terminal = !result.retryable || lastAttempt;

    await this.settle(
      intent,
      opened.channel,
      terminal ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE',
      failure,
      terminal ? 'FAILED' : undefined,
    );

    // Thrown after the effect has committed, so the runtime's own completion —
    // the retry delay, the dead letter, the generic attempt row — reflects an
    // outcome the notification domain has already recorded.
    //
    // The class stays truthful about *what failed* even on the last attempt: an
    // exhausted budget is not a rejection. The runtime turns a retryable class
    // terminal at the cap on its own, reading `maxAttempts` from the same
    // policy this method just used, so the two decisions cannot disagree.
    throw new NotificationDeliveryError(failure);
  }

  /**
   * Opens the envelope and checks everything that can be checked without a
   * transport.
   *
   * Expiry is a **transport** judgement made from the envelope's own fields. No
   * challenge or grant table is consulted: the business validity of the secret
   * belongs to the checkpoint that issued it, and querying for it here would
   * couple delivery to two domains it has no reason to know.
   */
  private open(envelope: DeliveryEnvelope, intent: CurrentNotificationIntent): OpenedDelivery {
    const payload = openDeliveryEnvelope(this.envelopeKey.require(), envelope);

    if (!isNotificationChannel(payload.channel) || payload.channel !== intent.channel) {
      throw new NotificationDeliveryError('NOTIFICATION_CHANNEL_MISMATCH');
    }

    const issuedAt = new Date(payload.issuedAt);
    const expiresAt = new Date(payload.expiresAt);
    if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
      throw new NotificationDeliveryError('NOTIFICATION_ENVELOPE_UNREADABLE');
    }
    if (expiresAt.getTime() <= Date.now()) {
      // Bounded and terminal. Nothing is minted, nothing is reissued and no
      // business resend is triggered: those are `APP4-B03`/`APP4-B05`, and a
      // transport that could mint its own secret would be able to answer its
      // own challenge.
      throw new NotificationDeliveryError('NOTIFICATION_MATERIAL_EXPIRED');
    }

    return {
      channel: payload.channel,
      normalizedRecipient: payload.normalizedRecipient,
      secretKind: payload.secretKind,
      secret: payload.secret,
      issuedAt,
      expiresAt,
    };
  }

  /**
   * The one call that touches a transport.
   *
   * A thrown adapter error becomes a retryable transport failure rather than
   * propagating: an exception's message is provider text, and the only thing
   * this path is allowed to learn from it is that the send did not report
   * success.
   */
  private async send(opened: OpenedDelivery): Promise<DeliveryResult> {
    try {
      return await this.channel.send({
        channel: opened.channel,
        normalizedRecipient: opened.normalizedRecipient,
        secretKind: opened.secretKind,
        secret: opened.secret,
        issuedAt: opened.issuedAt,
        expiresAt: opened.expiresAt,
      });
    } catch {
      return { outcome: 'FAILED', retryable: true };
    }
  }

  /** The atomic durable effect: the evidence row and the intent state together. */
  private async settle(
    intent: CurrentNotificationIntent,
    channel: string,
    outcome: NotificationDeliveryOutcome,
    failure: NotificationDeliveryFailure | undefined,
    settleTo: 'SATISFIED' | 'FAILED' | undefined,
  ): Promise<void> {
    await this.transactions.runInTransaction(() =>
      this.intents.settleAttempt({
        intentId: intent.id,
        channel,
        outcome,
        failure,
        attemptedAt: new Date(),
        settleTo,
      }),
    );
  }
}

/** The decrypted delivery, alive only for the duration of one attempt. */
interface OpenedDelivery {
  readonly channel: NotificationChannel;
  readonly normalizedRecipient: string;
  readonly secretKind: string;
  readonly secret: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/**
 * The APP4 recording development adapter (`APP4-W01`, `ADR-APP4-001` §12).
 *
 * The **only** channel adapter in the repository, and not a provider. It makes
 * no network call, opens no socket, loads no SDK and writes to no table, no file
 * and no log. It appends to an array in the current process's memory, and that
 * array dies with the process.
 *
 * That array is the one authorized outbound sink for the decrypted secret
 * (§6.6): APP4 has no provider yet, so the "message" a delivery produces has to
 * land somewhere a focused test can read, or nothing about the delivery path
 * could be proven end to end. It is memory-only for exactly that reason — the
 * moment it wrote a row or a log line, the plaintext would be at rest and the
 * envelope would have been pointless.
 *
 * **It is not a production transport and must never be presented as one.** A
 * deployment running this adapter has delivered nothing to anybody; choosing a
 * real provider is `IMP-O006` / `APP4-PO-001`, and it arrives as a second
 * adapter behind the same port.
 *
 * `program` exists so failure paths are testable. It scripts what this adapter
 * *reports*, never what it sends, and an unscripted call succeeds — so the
 * default behaviour of a dev deployment is an ordinary recorded delivery.
 */
import { Injectable } from '@nestjs/common';

import type {
  DeliveryResult,
  NotificationChannelPort,
  NotificationDelivery,
} from '../../domain/channel/notification-channel.port';

/** What the adapter kept about one delivery. Process memory only. */
export interface RecordedDelivery {
  readonly channel: string;
  readonly normalizedRecipient: string;
  readonly secretKind: string;
  readonly secret: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

@Injectable()
export class RecordingNotificationChannelAdapter implements NotificationChannelPort {
  private readonly delivered: RecordedDelivery[] = [];
  private readonly scripted: DeliveryResult[] = [];

  send(delivery: NotificationDelivery): Promise<DeliveryResult> {
    const result = this.scripted.shift() ?? { outcome: 'SENT' as const };

    // A refused delivery is still an attempt that happened: recording it is what
    // makes "the retry received the identical plaintext" a provable claim rather
    // than an assertion about code that was not observed.
    this.delivered.push({
      channel: delivery.channel,
      normalizedRecipient: delivery.normalizedRecipient,
      secretKind: delivery.secretKind,
      secret: delivery.secret,
      issuedAt: delivery.issuedAt,
      expiresAt: delivery.expiresAt,
    });

    return Promise.resolve(result);
  }

  /** Everything this process has delivered, in order. */
  records(): readonly RecordedDelivery[] {
    return this.delivered;
  }

  /** Scripts the next results, oldest first. Test-only. */
  program(...results: readonly DeliveryResult[]): void {
    this.scripted.push(...results);
  }

  /** Test-only reset. Nothing outside this process ever saw the records. */
  reset(): void {
    this.delivered.length = 0;
    this.scripted.length = 0;
  }
}

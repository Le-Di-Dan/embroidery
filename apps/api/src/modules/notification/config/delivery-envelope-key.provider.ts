/**
 * The API's handle on the delivery-envelope key (`APP4-B01`, `ADR-APP4-001` §6.2).
 *
 * **Lazily resolved on purpose.** Reading and validating the key in a Nest
 * factory would make every API process — and the `staff-bootstrap` CLI, which
 * boots the same `AppModule` — refuse to start without a key, including the
 * paths that never send a notification. `.env.example` declares the variable
 * empty, so that would break local bootstrap for a capability the process is not
 * using.
 *
 * Instead the key is validated the first time something actually seals. That is
 * still **fail-closed where it matters**: a process that cannot seal cannot
 * issue a secret it would never be able to deliver, and the failure surfaces at
 * the sealing call rather than being papered over with a default.
 *
 * The validated key is memoized, so the environment is read once per process.
 * The key material lives only inside the returned `EnvelopeKey` and is never
 * logged, serialized or placed in a request context.
 */
import { Injectable } from '@nestjs/common';
import { loadEnvelopeKey, type EnvelopeKey } from '@embroidery/notification-delivery';

@Injectable()
export class DeliveryEnvelopeKeyProvider {
  private cached: EnvelopeKey | undefined;

  /**
   * The validated key.
   *
   * Throws — naming the variable, never the value — when the environment does
   * not carry a usable one.
   */
  require(): EnvelopeKey {
    this.cached ??= loadEnvelopeKey(process.env);
    return this.cached;
  }
}

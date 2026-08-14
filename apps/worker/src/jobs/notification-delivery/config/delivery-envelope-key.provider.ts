/**
 * The worker's handle on the delivery-envelope key (`ADR-APP4-001` §6.2).
 *
 * Deliberately a mirror of the API's provider rather than a shared one: the
 * thing worth sharing is the *parsing*, and that already lives in
 * `@embroidery/notification-delivery`. What remains here is one lazily memoized
 * field, and turning that into a package would be an app-to-app coupling in
 * exchange for nothing.
 *
 * Lazy for the same reason as the API's: a Nest factory would make every worker
 * process refuse to start without a key, including deployments that run only the
 * Asset capabilities. `.env.example` declares the variable empty, so an eager
 * read would break local bootstrap for a capability the process is not using.
 *
 * Still fail-closed where it matters — a worker that cannot open an envelope
 * cannot deliver, and the failure surfaces at the opening call, classified,
 * rather than being papered over with a default. The key material lives only
 * inside the returned `EnvelopeKey` and is never logged or serialized.
 */
import { Injectable } from '@nestjs/common';
import { loadEnvelopeKey, type EnvelopeKey } from '@embroidery/notification-delivery';

@Injectable()
export class WorkerDeliveryEnvelopeKeyProvider {
  private cached: EnvelopeKey | undefined;

  /** The validated key. Throws naming the variable, never the value. */
  require(): EnvelopeKey {
    this.cached ??= loadEnvelopeKey(process.env);
    return this.cached;
  }
}

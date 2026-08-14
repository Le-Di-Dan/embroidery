/**
 * The worker's handle on `STOREFRONT_PUBLIC_ORIGIN` (`APP4-B05`).
 *
 * A lazily memoized mirror of `WorkerDeliveryEnvelopeKeyProvider`, for the same
 * reason it is lazy: a Nest factory would make every worker process refuse to
 * start without the value, including deployments that run only the Asset
 * capabilities and never render a link. `.env.example` declares the variable
 * empty, so an eager read would break local bootstrap for a capability the
 * process is not using.
 *
 * Still fail-closed exactly where it matters. {@link require} is the only way to
 * obtain the origin and it throws; the one caller is the secure-link renderer,
 * so an unconfigured deployment delivers no secure link at all rather than one
 * pointing somewhere plausible. Verification-code delivery never calls this and
 * is unaffected.
 */
import { Injectable } from '@nestjs/common';

import { loadStorefrontPublicOrigin } from './storefront-origin.config';

@Injectable()
export class StorefrontPublicOriginProvider {
  private cached: string | undefined;

  /** The validated, trailing-slash-free origin. Throws naming the variable. */
  require(): string {
    this.cached ??= loadStorefrontPublicOrigin(process.env);
    return this.cached;
  }
}

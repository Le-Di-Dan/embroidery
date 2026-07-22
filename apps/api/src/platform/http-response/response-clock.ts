import { Injectable } from '@nestjs/common';

/**
 * Supplies the `meta.timestamp` required by the canonical envelope (D-034).
 *
 * It exists as an injectable seam rather than a bare `new Date()` call inside
 * the interceptor so tests can assert an exact envelope instead of matching the
 * timestamp with a regular expression, and so the envelope factory itself can
 * stay pure.
 */
@Injectable()
export class ResponseClock {
  /** ISO-8601 UTC, the format the canonical `ApiResponseMeta` documents. */
  nowIso(): string {
    return new Date().toISOString();
  }
}

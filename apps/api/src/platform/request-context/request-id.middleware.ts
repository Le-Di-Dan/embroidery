import { Injectable, type NestMiddleware } from '@nestjs/common';

import { RequestContextService } from './request-context.service';
import {
  REQUEST_ID_HEADER_LOOKUP,
  generateRequestId,
  isValidRequestId,
} from './request-id.contract';

/**
 * Structural request shape: avoids importing an HTTP-server type into the
 * platform layer, matching the convention used by the health controller.
 */
interface HeaderBearingRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Resolves the one effective request ID for a request.
 *
 * Exported for direct unit testing: the decision table is the security-relevant
 * part of this middleware and deserves assertions that do not need an HTTP
 * server.
 */
export function resolveRequestId(headerValue: string | string[] | undefined): string {
  // An array means the client (or an intermediary) sent the header more than
  // once. There is no safe way to pick a winner, so the ambiguous input is
  // discarded rather than resolved by an arbitrary rule.
  if (isValidRequestId(headerValue)) {
    return headerValue;
  }
  return generateRequestId();
}

/**
 * Establishes the request context for every HTTP request (APP0-B02).
 *
 * A valid gateway-supplied `X-Request-ID` is preserved byte-for-byte so the
 * gateway access log, the API and later the structured logs all name the same
 * request. Anything missing, oversized, ambiguous or outside the allowlist is
 * replaced by a locally generated ID and is never echoed back, so untrusted
 * input cannot reach a log line or a response header.
 *
 * The API deliberately does **not** set the `X-Request-ID` response header: the
 * gateway already owns it (`add_header X-Request-ID $effective_request_id
 * always`), and emitting it here too would send the header twice to the client.
 * Body-level correlation is APP0-B03's envelope, not this checkpoint's.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: HeaderBearingRequest, _response: unknown, next: () => void): void {
    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER_LOOKUP]);

    // `next` runs inside `run()` so the context covers the whole downstream
    // async chain. Errors are not caught here: swallowing them would hide
    // failures, and exception mapping belongs to APP0-B03.
    this.requestContext.run({ requestId }, next);
  }
}

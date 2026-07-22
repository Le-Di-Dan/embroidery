import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/**
 * Envelope opt-out and per-endpoint success codes (APP0-B03).
 *
 * Both are route metadata read through `Reflector`, never a path string. A path
 * list in the interceptor would silently stop matching the day a route moves,
 * and it puts knowledge of specific endpoints into a platform component that
 * should not have it.
 */

export const SKIP_API_ENVELOPE = 'platform:skip-api-envelope';

/**
 * Marks a handler or controller as exempt from success-envelope wrapping.
 *
 * Reserved for the controlled exceptions in BACKEND_CONVENTIONS §6: health and
 * other operational probes, binary/streaming responses, redirects and
 * third-party protocol contracts. It does **not** disable safe exception
 * mapping — an exempt endpoint that throws is still sanitised, because leaking
 * an internal error is never part of an operational contract.
 */
export function SkipApiEnvelope(): CustomDecorator<string> {
  return SetMetadata(SKIP_API_ENVELOPE, true);
}

export const API_SUCCESS_META = 'platform:api-success-meta';

export interface ApiSuccessMeta {
  readonly code: string;
  readonly message: string;
}

/**
 * Declares the stable success `code` and human-readable `message` for a
 * handler, as required by the canonical envelope (D-034).
 *
 * Without it the platform default is used. Controllers still never build an
 * envelope by hand — they declare the code and return their data.
 */
export function ApiSuccessCode(code: string, message: string): CustomDecorator<string> {
  return SetMetadata<string, ApiSuccessMeta>(API_SUCCESS_META, { code, message });
}

import type {
  ApiErrorResponse,
  ApiFieldError,
  ApiResponseMeta,
  ApiSuccessResponse,
} from '@embroidery/contracts';

import { API_SUCCESS_CODE, API_SUCCESS_MESSAGE } from './api-error-code';

/**
 * Builds the canonical response envelope (D-034, APP0-B03).
 *
 * The shape is owned by `@embroidery/contracts`; this module only constructs
 * it. The import is `import type`, which TypeScript erases entirely, so the
 * compiled API never `require`s that package — it still resolves to TypeScript
 * source and is not Node-loadable under IMP-D018. Type-only conformance gives
 * a compile error if the canonical shape and this factory ever diverge, which
 * is the guarantee that matters, without duplicating the shape.
 *
 * Both functions are pure: `requestId` and `timestamp` are supplied by the
 * caller rather than read from async storage or the clock. That keeps the
 * envelope trivially testable and keeps time out of a function that would
 * otherwise be impossible to assert on.
 */

export interface EnvelopeContext {
  readonly requestId: string;
  /** ISO-8601 UTC. Required by the canonical `ApiResponseMeta`. */
  readonly timestamp: string;
}

export interface SuccessEnvelopeInput<TData> extends EnvelopeContext {
  readonly data: TData;
  readonly code?: string;
  readonly message?: string;
}

export interface ErrorEnvelopeInput extends EnvelopeContext {
  readonly code: string;
  readonly message: string;
  readonly errors?: readonly ApiFieldError[];
}

function createMeta({ requestId, timestamp }: EnvelopeContext): ApiResponseMeta {
  return { requestId, timestamp };
}

/**
 * Identity of every envelope this factory has produced.
 *
 * The canonical `isApiResponseEnvelope` guard would be the natural check, but
 * it is a *runtime* export of `@embroidery/contracts`, which still resolves to
 * TypeScript source and is therefore not loadable from the compiled API
 * (IMP-D018). Re-implementing the structural check here would duplicate the
 * canonical shape — the one thing this checkpoint must not do.
 *
 * A `WeakSet` avoids both: it records the objects this factory created without
 * adding any property to the serialised JSON, and entries are collected with
 * the response itself. The trade-off is recorded as a follow-up: an envelope
 * built by something other than this factory is not recognised. Nothing in the
 * application produces one — controllers are forbidden from hand-building
 * response shapes — and the gap closes when the contracts package becomes
 * runtime-loadable in APP0-C02.
 */
const factoryEnvelopes = new WeakSet<object>();

/** True when `value` is an envelope produced by this factory. */
export function isEnvelopeFromFactory(value: unknown): boolean {
  return typeof value === 'object' && value !== null && factoryEnvelopes.has(value);
}

function remember<TEnvelope extends object>(envelope: TEnvelope): TEnvelope {
  factoryEnvelopes.add(envelope);
  return envelope;
}

export function createSuccessEnvelope<TData>(
  input: SuccessEnvelopeInput<TData>,
): ApiSuccessResponse<TData> {
  return remember({
    success: true,
    code: input.code ?? API_SUCCESS_CODE,
    message: input.message ?? API_SUCCESS_MESSAGE,
    data: input.data,
    meta: createMeta(input),
  });
}

export function createErrorEnvelope(input: ErrorEnvelopeInput): ApiErrorResponse {
  const envelope: ApiErrorResponse = {
    success: false,
    code: input.code,
    message: input.message,
    meta: createMeta(input),
  };

  // `errors` is optional in the contract and `exactOptionalPropertyTypes` is on,
  // so it is added only when there is something to report rather than set to
  // undefined — an explicit `"errors": undefined` would serialise inconsistently.
  if (input.errors !== undefined && input.errors.length > 0) {
    return remember({ ...envelope, errors: [...input.errors] });
  }
  return remember(envelope);
}

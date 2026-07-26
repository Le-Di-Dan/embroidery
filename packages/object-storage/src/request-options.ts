/**
 * Per-request SDK options.
 *
 * Under `exactOptionalPropertyTypes` an explicit `abortSignal: undefined` is
 * not the same as omitting the property, and the SDK's `HttpHandlerOptions`
 * rejects it. Every call site therefore goes through this helper instead of
 * repeating a conditional spread.
 */
export interface ProviderRequestOptions {
  readonly abortSignal?: AbortSignal;
}

export function requestOptions(signal: AbortSignal | undefined): ProviderRequestOptions {
  return signal === undefined ? {} : { abortSignal: signal };
}

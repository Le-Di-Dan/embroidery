/**
 * Per-request SDK options, and the dependency deadline every storage call
 * carries (`APP12-H04-C1` §5).
 *
 * Under `exactOptionalPropertyTypes` an explicit `abortSignal: undefined` is
 * not the same as omitting the property, and the SDK's `HttpHandlerOptions`
 * rejects it. Every call site therefore goes through this helper instead of
 * repeating a conditional spread.
 *
 * ## Why the deadline lives here rather than in the client configuration
 *
 * `APP12-H04` found an evidence upload hanging until the Gateway answered with
 * its own HTML `504`, and `APP12-H04-C1` set out to move that boundary into the
 * application by configuring the S3 client. That did not work, and the reason is
 * recorded here so nobody tries it again:
 *
 * - passing `requestHandler: { connectionTimeout, requestTimeout }` as a plain
 *   object is silently discarded — the SDK builds a default handler instead;
 * - passing an explicitly constructed `NodeHttpHandler` with the same options
 *   did not bound a stalled response either. Measured against a socket that
 *   accepts a connection and then never answers, **both** forms hung
 *   indefinitely rather than failing at `requestTimeout`.
 *
 * So the shared client does *not* own this boundary, and `APP12-H04-C1` §5's
 * condition for preferring client configuration is not met. The abort signal is
 * the seam that does work: it is already threaded into every command in this
 * adapter, the SDK honours it, and composing a deadline into it bounds one
 * operation without a per-call-site wrapper.
 */

/**
 * How long any single object-storage operation may take before it is abandoned.
 *
 * A total-duration cap, not an inactivity one, so it must clear the largest
 * legitimate transfer. The bound that matters is
 * `deadline < Gateway request timeout`: at 20s against the 60s NGINX Gateway
 * Fabric default there is ample room for a 10 MiB evidence upload on a healthy
 * store — measured in the low hundreds of milliseconds — while a store that has
 * stopped answering surrenders the request to the application, which answers in
 * its own envelope rather than letting nginx answer in HTML.
 */
export const STORAGE_OPERATION_DEADLINE_MS = 20_000;

export interface ProviderRequestOptions {
  readonly abortSignal?: AbortSignal;
}

/**
 * The caller's signal combined with this operation's deadline.
 *
 * `AbortSignal.any` keeps the caller's own cancellation authoritative — a
 * client that goes away still aborts the upload immediately — while adding a
 * ceiling it cannot exceed. When the caller passes no signal, the deadline is
 * the only one, so an internal call is bounded too.
 */
export function requestOptions(
  signal: AbortSignal | undefined,
  deadlineMs: number = STORAGE_OPERATION_DEADLINE_MS,
): ProviderRequestOptions {
  const deadline = AbortSignal.timeout(deadlineMs);
  return { abortSignal: signal === undefined ? deadline : AbortSignal.any([signal, deadline]) };
}

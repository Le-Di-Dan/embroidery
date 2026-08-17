/**
 * The query-key factory for the Admin request detail screen (`APP5-A02`).
 *
 * Two entries, and they are deliberately different kinds of thing:
 *
 * - **the detail** is JSON the screen re-reads after every mutation, so it is
 *   keyed by request id alone and stays in the cache across a dialog opening;
 * - **one evidence image** is a private `Blob`. It is keyed by request *and*
 *   asset because `APP5-B06` serves no address that reaches an asset outside the
 *   request it is bound to — a key that carried only the asset id would let a
 *   cached entry answer for a second request, which is exactly the confusion the
 *   endpoint's shape exists to prevent.
 *
 * Nothing else is ever a key part. A credential, an `AbortSignal`, an object URL
 * or a raw error would be serialized into the cache and outlive the request that
 * produced it.
 */
const ROOT = ['admin', 'custom-requests'] as const;

export const customRequestDetailKeys = {
  all: ROOT,
  detail: (requestId: string) => [...ROOT, 'detail', requestId] as const,
  /** One private image, addressed exactly as `APP5-B06` addresses it. */
  evidence: (requestId: string, assetId: string) =>
    [...ROOT, 'detail', requestId, 'asset', assetId] as const,
} as const;

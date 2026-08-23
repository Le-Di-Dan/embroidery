/**
 * The query-key factory for the Admin order + deposit workspace.
 *
 * Three entries, and they are deliberately different kinds of thing:
 *
 * - **the order** is the frozen `APP7-B02` read. It never changes as a result of
 *   anything on this screen except the order's own status, so it is keyed by
 *   order id alone and stays in the cache across a dialog opening.
 * - **the payments** are the `APP7-B04` read: the obligation, every attempt,
 *   the evidence metadata and the reconciliation history. This is what a verify
 *   or a review re-reads, and the only thing either of them may be believed
 *   through.
 * - **one evidence image** is a private `Blob`, keyed by order *and*
 *   `evidenceId`. The order is part of the key even though `APP7-B06` addresses
 *   the association alone: a cached entry that could answer for a second order's
 *   screen would outlive the page that authorized it, and the id is cheap to
 *   include. It is never keyed by an asset id, because `APP7-B04` publishes none
 *   and no route accepts one.
 *
 * Nothing else is ever a key part. A credential, an `AbortSignal`, an object URL
 * or a raw error would be serialized into the cache and outlive the request that
 * produced it.
 */
const ROOT = ['admin', 'orders'] as const;

export const orderDetailKeys = {
  all: ROOT,
  detail: (orderId: string) => [...ROOT, 'detail', orderId] as const,
  payments: (orderId: string) => [...ROOT, 'detail', orderId, 'payments'] as const,
  /** One private image, addressed exactly as `APP7-B06` addresses it. */
  evidence: (orderId: string, evidenceId: string) =>
    [...ROOT, 'detail', orderId, 'evidence', evidenceId] as const,
} as const;

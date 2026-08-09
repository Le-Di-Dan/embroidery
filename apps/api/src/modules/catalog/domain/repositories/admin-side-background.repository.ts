/**
 * The Admin Side-background delivery read (`APP3-B02A` §3).
 *
 * One method, one bounded query, one row — the same shape as the public read,
 * addressed by **ids** rather than by slug and code. Admin already holds the
 * Product and Side UUIDs from the placement model, and an id-addressed route
 * cannot be reached by guessing a public address.
 *
 * The descriptor carries the storage key because the service must open the
 * object, and carries it *only* to the service: nothing above the application
 * layer ever sees it, and the binary response has no field it could occupy.
 *
 * The quartet travels with it because the transport contract depends on it: the
 * persisted `media_type` becomes the `Content-Type` and the persisted
 * `byte_size` is reconciled against the provider's own count before a
 * `Content-Length` is sent.
 */

export const ADMIN_SIDE_BACKGROUND_REPOSITORY = Symbol('ADMIN_SIDE_BACKGROUND_REPOSITORY');

export interface AdminSideBackgroundLookup {
  /** The B02 Product UUID, never the public slug. */
  readonly productId: string;
  /** The Side UUID, which must belong to that Product. */
  readonly sideId: string;
}

/**
 * What one deliverable background is, proven by the query rather than asserted.
 *
 * Every field is non-optional: a row that could not supply all of them is not a
 * deliverable background and never becomes a descriptor. That is the quartet
 * contract `IMP-D044` PO-12 makes physical, restated as a type so the delivery
 * path cannot proceed on a partial one.
 */
export interface AdminSideBackgroundDescriptor {
  readonly storageKey: string;
  readonly mediaType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteSize: number;
}

export interface AdminSideBackgroundRepository {
  /**
   * Resolves the one deliverable background for a Product id and Side id, or
   * `undefined` when any fact fails — including the Side belonging to another
   * Product.
   *
   * Opens no transaction (DEC-DB7-006). An ordinary read needs none, and this
   * one must not hold one: the caller streams the object afterwards, and a
   * transaction spanning that would pin a connection for a download.
   */
  findDeliverable(
    lookup: AdminSideBackgroundLookup,
  ): Promise<AdminSideBackgroundDescriptor | undefined>;
}

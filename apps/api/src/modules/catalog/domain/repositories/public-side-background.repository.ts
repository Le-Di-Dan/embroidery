/**
 * The public Side-background delivery read (`APP3-B02` §4).
 *
 * One method, one bounded query, one row. The descriptor carries the storage
 * key because the service must open the object — and carries it *only* to the
 * service: nothing above the application layer ever sees it, and the public DTO
 * has no field it could occupy.
 *
 * The quartet travels with it because the transport contract depends on it. The
 * persisted `media_type` becomes the `Content-Type` and the persisted
 * `byte_size` is reconciled against the provider's own count before a
 * `Content-Length` is sent, so the row and the object have to agree before a
 * single byte is written.
 */

export const PUBLIC_SIDE_BACKGROUND_REPOSITORY = Symbol('PUBLIC_SIDE_BACKGROUND_REPOSITORY');

export interface PublicSideBackgroundLookup {
  /** The public Product address. */
  readonly slug: string;
  /** The Side's stable public code. */
  readonly sideCode: string;
}

/**
 * What one deliverable background is, proven by the query rather than asserted.
 *
 * Every field is non-optional: a row that could not supply all of them is not a
 * deliverable background and never becomes a descriptor. That is the quartet
 * contract `IMP-D044` PO-12 makes physical, restated here as a type so the
 * delivery path cannot proceed on a partial one.
 */
export interface PublicSideBackgroundDescriptor {
  readonly storageKey: string;
  readonly mediaType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteSize: number;
}

export interface PublicSideBackgroundRepository {
  /**
   * Resolves the one deliverable background for a Product slug and Side code,
   * or `undefined` when any contextual fact fails.
   *
   * Opens no transaction (DEC-DB7-006). An ordinary read needs none, and this
   * one must not hold one: the caller streams the object afterwards, and a
   * transaction spanning that would pin a connection for a client's download.
   */
  findDeliverable(
    lookup: PublicSideBackgroundLookup,
  ): Promise<PublicSideBackgroundDescriptor | undefined>;
}

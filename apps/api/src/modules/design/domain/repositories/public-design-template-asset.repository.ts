/**
 * The read boundary for published Template asset delivery (`APP3-B05A`).
 *
 * One method, and it is a **read**. There is no `attach`, no `publish`, no
 * `touch` and no repair behind this token, which is how the checkpoint's
 * zero-write guarantee is made structural rather than promised: the delivery
 * module binds this port and nothing else, so nothing reachable from the route
 * has a write to call.
 */
export interface PublicTemplateAssetLookup {
  readonly slug: string;
  /** The exact Version number the caller addressed. Never "latest". */
  readonly version: number;
  readonly assetId: string;
}

/**
 * Everything the durable state can say about one candidate delivery.
 *
 * The document travels with it deliberately. Proving that *this* Version's
 * canonical document references the Asset is a P01 question, not a SQL one, and
 * splitting the two reads would open a window in which the Version could change
 * between them — so the same statement that proves the association returns the
 * document it must be checked against.
 *
 * The scope triple travels for the same reason: Catalog decides whether the
 * placement is still publicly designable, and it must be asked about the chain
 * this exact row carries rather than one re-read a moment later.
 */
export interface PublicTemplateAssetCandidate {
  readonly storageKey: string;
  readonly mediaType: string;
  readonly byteSize: number;
  /** The canonical document of the exact current public Version, as stored. */
  readonly document: unknown;
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
}

export interface PublicDesignTemplateAssetRepository {
  /**
   * The single statement behind every durable term of the authorization.
   *
   * Returns a candidate only when the Template is `PUBLISHED`, the requested
   * Version is the **highest** Version carrying a publication timestamp, the
   * durable `design_template_assets` association exists for that Template and
   * Asset, the Asset is an accepted Template-artwork original, and its
   * editor-safe derivative is `READY`, unwatermarked and completely described.
   *
   * Document membership and current Catalog eligibility are *not* decided here.
   * They are decided by the authorities that own them, against what this returns.
   */
  findDeliverableCandidate(
    lookup: PublicTemplateAssetLookup,
  ): Promise<PublicTemplateAssetCandidate | undefined>;
}

export const PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY = Symbol(
  'PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY',
);

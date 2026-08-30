/**
 * The public gallery-media delivery contract (`APP11-B03` §9).
 *
 * Exactly one read, deliberately: the whole visibility decision is one bounded
 * query, so there is no window between "is this entry published" and "which
 * object do I open" in which a concurrent unpublish could slip through, and no
 * per-image follow-up query to become an N+1.
 */
import type { AssetDerivativeKind } from '@embroidery/database';

export const PUBLIC_GALLERY_MEDIA_REPOSITORY = Symbol('PUBLIC_GALLERY_MEDIA_REPOSITORY');

export interface PublicGalleryMediaLookup {
  /** Server-owned gallery slug, already syntactically validated. */
  readonly slug: string;
  /** `assets.id` — the opaque association identity from the path. */
  readonly assetId: string;
  /** The persisted derivative kind the requested rendition maps to. */
  readonly derivativeKind: AssetDerivativeKind;
}

/**
 * Everything needed to open the object, and nothing else.
 *
 * **`storageKey` is internal.** It is the private object address; it never
 * crosses the API response boundary, never enters a log line and never appears
 * in an error. The descriptor exists precisely so that the one value which must
 * travel from the repository to the storage adapter has a named, reviewable
 * boundary instead of being threaded through a projection that a future change
 * might serialise.
 */
export interface PublicGalleryMediaDescriptor {
  readonly storageKey: string;
}

export interface PublicGalleryMediaRepository {
  /**
   * Resolves the delivery descriptor, or `undefined` when *any* visibility or
   * eligibility fact fails.
   *
   * Returning one undifferentiated absence is the contract: the caller must not
   * be able to learn which predicate rejected the request, so the repository
   * does not report it.
   */
  findDeliverable(
    lookup: PublicGalleryMediaLookup,
  ): Promise<PublicGalleryMediaDescriptor | undefined>;
}

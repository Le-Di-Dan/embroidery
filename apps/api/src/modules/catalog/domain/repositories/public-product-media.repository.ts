/**
 * The public catalog-media delivery contract (`APP2-T01`).
 *
 * Exactly one read, deliberately: the whole visibility decision is one bounded
 * query, so there is no window between "is this product public" and "which
 * object do I open" in which a concurrent unpublish could slip through, and no
 * per-media follow-up query to become an N+1.
 */
import type { AssetDerivativeKind, ProductMediaRole } from '@embroidery/database';

export const PUBLIC_PRODUCT_MEDIA_REPOSITORY = Symbol('PUBLIC_PRODUCT_MEDIA_REPOSITORY');

export interface PublicProductMediaLookup {
  /** Server-owned Product slug, already syntactically validated. */
  readonly slug: string;
  /** `product_media.id` — the opaque association identity from the path. */
  readonly productMediaId: string;
  /** The persisted derivative kind the requested rendition maps to. */
  readonly derivativeKind: AssetDerivativeKind;
  /** The association role the rendition requires, when it requires one. */
  readonly requiredRole: ProductMediaRole | undefined;
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
export interface PublicProductMediaDescriptor {
  readonly storageKey: string;
}

export interface PublicProductMediaRepository {
  /**
   * Resolves the delivery descriptor, or `undefined` when *any* visibility or
   * eligibility fact fails.
   *
   * Returning one undifferentiated absence is the contract: the caller must not
   * be able to learn which predicate rejected the request, so the repository
   * does not report it.
   */
  findDeliverable(
    lookup: PublicProductMediaLookup,
  ): Promise<PublicProductMediaDescriptor | undefined>;
}

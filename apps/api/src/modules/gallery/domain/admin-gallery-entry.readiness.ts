/**
 * Gallery publication readiness (`APP11-B02` §8).
 *
 * A pure function over facts the caller has already read **under lock**. It
 * opens nothing, reads nothing and knows no HTTP: the whole point is that the
 * same evaluator can be run against a locked snapshot inside the publish
 * transaction without a second, drifting definition of "ready" existing
 * anywhere.
 *
 * The requirement set is closed and ordered (`GALLERY_ENTRY_PUBLICATION_REQUIREMENTS`),
 * so a refusal names exactly which facts are missing, in a stable order, rather
 * than reporting an opaque "not ready".
 *
 * Nothing here consults the request. Every fact is read from the persisted row
 * and the persisted associations, because a client that echoes back a title it
 * believes it saved is not evidence that the row carries one.
 */
import {
  GALLERY_ENTRY_PUBLICATION_REQUIREMENTS,
  type GalleryEntryPublicationRequirement,
} from './admin-gallery-entry.policy';

/** Everything the evaluation depends on, read from persisted state. */
export interface GalleryEntryPublicationFacts {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  /**
   * How many of the entry's **currently attached** associations still satisfy
   * the public-media boundary.
   *
   * A count rather than the ids: readiness asks whether the entry can be shown,
   * not which image leads. Counted from a locked read, so an asset cannot be
   * reclassified or tombstoned between the check and the transition.
   */
  readonly eligibleAssetCount: number;
}

export interface GalleryEntryPublicationReadiness {
  readonly eligible: boolean;
  readonly unsatisfied: readonly GalleryEntryPublicationRequirement[];
}

/** True when the value carries a character that is not whitespace. */
function present(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Evaluates the closed requirement set.
 *
 * The predicates are listed in the same order as the canonical requirement
 * list, and the index-wise pairing is what keeps the two from drifting: adding
 * a requirement without adding its predicate is a type error, not a silently
 * unchecked rule.
 */
export function evaluateGalleryPublicationReadiness(
  facts: GalleryEntryPublicationFacts,
): GalleryEntryPublicationReadiness {
  const satisfied: Record<GalleryEntryPublicationRequirement, boolean> = {
    GALLERY_ENTRY_TITLE_REQUIRED: present(facts.title),
    GALLERY_ENTRY_SLUG_REQUIRED: present(facts.slug),
    GALLERY_ENTRY_DESCRIPTION_REQUIRED: present(facts.description),
    GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED: facts.eligibleAssetCount > 0,
  };

  const unsatisfied = GALLERY_ENTRY_PUBLICATION_REQUIREMENTS.filter(
    (requirement) => !satisfied[requirement],
  );

  return { eligible: unsatisfied.length === 0, unsatisfied };
}

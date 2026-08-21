/**
 * The bounded Admin view of one formal Design Version (`APP6-B08` §16).
 *
 * Written field by field rather than spread, the rule `APP5-B04` and `APP6-B07`
 * both follow: the repository type has nowhere to put a property it gains later,
 * so a column added upstream cannot reach an HTTP response by accident.
 *
 * ## What is not here
 *
 * The **document** is not. B07 is the source read and a future exact-version
 * detail read would be its own operation; a history list that carried every
 * document would ship the whole design thread on every render of an Admin
 * screen that only draws rows. Neither is `document_hash` — a DRAFT has none,
 * and the hash is `GRD-007`'s approval binding rather than list metadata.
 *
 * No storage key, no derivative id, no preview hash, no provider reference and
 * no secret appears here, and none is reachable: the repository type carries
 * none of them either.
 *
 * ## Review outcomes are read, never inferred
 *
 * `reviews` is whatever `design_reviews` actually holds for the version, in the
 * repository's deterministic order — an empty array for a DRAFT and for any
 * version nobody has decided on. Nothing derives an outcome from
 * `DesignVersion.status`: an `APPROVED` status and an `APPROVE` review row are
 * different facts recorded at different moments, and manufacturing the second
 * from the first would put a decision in the history that no customer made.
 */
import type { DesignReviewOutcome } from '@embroidery/database';

import type {
  DesignVersion,
  DesignVersionId,
  DesignVersionReview,
} from '../domain/repositories/design-case.repository';

export interface DesignVersionReviewView {
  readonly outcome: DesignReviewOutcome;
  readonly decidedAt: Date;
}

export interface DesignVersionView {
  readonly versionId: string;
  readonly version: number;
  readonly status: string;
  readonly parentVersionId: string | undefined;
  readonly documentSchemaVersion: number;
  /** Derived from the persisted placement, never a stored column. */
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  readonly productId: string | undefined;
  readonly productVariantId: string | undefined;
  readonly productSideId: string | undefined;
  readonly embroideryAreaId: string | undefined;
  readonly placementSideLabel: string | undefined;
  readonly placementAreaLabel: string | undefined;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  /** True only when the design case's own pointer names this version. */
  readonly current: boolean;
  readonly sentAt: Date | undefined;
  readonly approvedAt: Date | undefined;
  readonly reviews: readonly DesignVersionReviewView[];
}

export function projectVersion(
  version: DesignVersion,
  currentVersionId: DesignVersionId | undefined,
  reviews: readonly DesignVersionReview[],
): DesignVersionView {
  const placement = version.placement;
  const catalog = placement.branch === 'CATALOG';

  return {
    versionId: version.id,
    version: version.version,
    status: version.status,
    parentVersionId: version.parentVersionId,
    documentSchemaVersion: version.documentSchemaVersion,
    branch: placement.branch,
    // Each branch reports its own facts and `undefined` for the other's. A COP
    // version returning a Catalog id, or a Catalog version returning a label,
    // would be the mixed row CST-129 exists to make unstorable — reintroduced at
    // the read edge, where nothing would catch it.
    productId: catalog ? placement.productId : undefined,
    productVariantId: catalog ? placement.productVariantId : undefined,
    productSideId: catalog ? placement.productSideId : undefined,
    embroideryAreaId: catalog ? placement.embroideryAreaId : undefined,
    placementSideLabel: catalog ? undefined : placement.sideLabel,
    placementAreaLabel: catalog ? undefined : placement.areaLabel,
    physicalWidthMm: placement.physicalWidthMm,
    physicalHeightMm: placement.physicalHeightMm,
    // Truthful because it is read from `design_cases.current_version_id` itself
    // rather than guessed from "the highest version number" — the two agree
    // today, and a marker that silently stopped agreeing would be worse than
    // none.
    current: currentVersionId !== undefined && currentVersionId === version.id,
    sentAt: version.sentAt,
    approvedAt: version.approvedAt,
    reviews: reviews.map((review) => ({ outcome: review.outcome, decidedAt: review.decidedAt })),
  };
}

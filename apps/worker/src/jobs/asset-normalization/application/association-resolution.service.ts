/**
 * Association-bound profile derivation (`IMP-D046` PO-03).
 *
 * This is the service `APP3-W01` stopped for. The event names an association;
 * the profile is derived here, at claim time, by re-reading that association and
 * the Asset — never taken from the message, never inferred from a MIME type, and
 * never found by scanning an Asset's associations for one that happens to fit.
 *
 * The direction of every check matters. The payload's discriminator selects
 * *which row to read*; the row then has to agree that it points at the Asset the
 * payload named, that it is still current, and that the Asset is still something
 * this profile may process. A caller who supplied a valid association id for an
 * Asset it does not own gets nothing, because the association's own `asset_id`
 * is what closes the loop.
 *
 * Every refusal is one bounded code. None reveals which of the checks failed in
 * a way that would disclose an owner, a template, a session or the existence of
 * an Asset the caller cannot see.
 */
import { Inject, Injectable } from '@nestjs/common';

import type { AssociationRef } from '../domain/asset-normalization.payload';
import { associationIdOf } from '../domain/asset-normalization.payload';
import { normalizationRejection } from '../domain/normalization-outcome';
import type { NormalizationProfile } from '../domain/normalization-policy';
import {
  ASSET_NORMALIZATION_REPOSITORY,
  type AssetNormalizationRepository,
  type NormalizationSourceFacts,
} from '../domain/repositories/asset-normalization.repository';

/** The exact mapping `IMP-D046` PO-03 locks. Total, and the only one. */
export const PROFILE_BY_ASSOCIATION: Readonly<
  Record<AssociationRef['kind'], NormalizationProfile>
> = Object.freeze({
  PRODUCT_SIDE_BACKGROUND: 'SIDE_BACKGROUND',
  DESIGN_TEMPLATE_ASSET: 'TEMPLATE_ASSET',
  DESIGN_SESSION_ASSET: 'SESSION_UPLOAD',
});

/**
 * The Asset states and lanes each profile admits (IMP-D044 PO-03/PO-04/PO-05).
 *
 * `ACCEPTED` throughout: normalization presupposes a completed inspection, so an
 * Asset still `INSPECTING` — or one since `REJECTED` or tombstoned — is a stale
 * context, not something to wait for.
 */
const LANE_BY_PROFILE: Readonly<Record<NormalizationProfile, readonly string[]>> = Object.freeze({
  SIDE_BACKGROUND: ['CATALOG_MEDIA'],
  TEMPLATE_ASSET: ['TEMPLATE_SOURCE'],
  SESSION_UPLOAD: ['CUSTOMER_UPLOAD'],
});

const REQUIRED_ASSET_STATUS = 'ACCEPTED';

export interface ResolvedContext {
  readonly profile: NormalizationProfile;
  readonly source: NormalizationSourceFacts;
}

@Injectable()
export class AssociationResolutionService {
  constructor(
    @Inject(ASSET_NORMALIZATION_REPOSITORY)
    private readonly repository: AssetNormalizationRepository,
  ) {}

  /**
   * Proves the request is still authorized, and says which profile it is.
   *
   * Throws the single bounded `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` for
   * every way the context can have moved. One code rather than several on
   * purpose: "the association is gone", "it now points elsewhere" and "its owner
   * was archived" are the same fact to a caller — the request is no longer
   * authorized — and distinguishing them in an error would describe rows the
   * caller may not be entitled to know exist.
   */
  async resolve(assetId: string, reference: AssociationRef): Promise<ResolvedContext> {
    const association = await this.repository.findAssociation(
      reference.kind,
      associationIdOf(reference),
    );
    if (association === undefined || !association.active || association.assetId !== assetId) {
      throw normalizationRejection('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
    }

    const source = await this.repository.findSource(assetId);
    if (source === undefined || source.deleted || source.status !== REQUIRED_ASSET_STATUS) {
      throw normalizationRejection('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
    }

    const profile = PROFILE_BY_ASSOCIATION[reference.kind];
    if (!LANE_BY_PROFILE[profile].includes(source.kind)) {
      // The association is valid and the Asset is live, but it belongs to a
      // different intake lane than this profile may normalize — a Template
      // pointing at a customer upload, say. That is a context failure, not a
      // media one: nothing about the bytes was examined.
      throw normalizationRejection('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE');
    }

    return { profile, source };
  }
}

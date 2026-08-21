/**
 * Resolves the exact agreement-version set an approval will bind
 * (`APP6-B10` §14, `APP6-G01-C1` §5.3).
 *
 * ```text
 * design_approval.agreements policy   → the required types, in published order
 * AgreementRepository.effectiveVersions(types, now)
 *                                     → the PUBLISHED, in-window, current row
 *                                       of each type
 * exactly one per type, or refuse      → the set B10 shows and B11 verifies
 * ```
 *
 * ### The required set is read, never written down
 *
 * The types come from the published policy every time this runs. There is no
 * constant in this file, no fallback array, and no second allow-list beside the
 * dataset — `APP6-B10` §10 forbids one explicitly, and a hard-coded pair here
 * would silently outvote an operator who published a third type.
 *
 * ### "Effective" is the repository's definition, unchanged
 *
 * `effectiveVersions` joins through `agreements.current_version_id` and requires
 * `PUBLISHED` with an `effective_from` at or before the instant asked for, which
 * is exactly the four-part rule `APP6-G01-C1` §5.3 states: published, inside its
 * window, not superseded, not withdrawn. Superseded and withdrawn rows are
 * excluded structurally rather than by a second predicate here — `publishVersion`
 * moves the outgoing row to `SUPERSEDED` and `withdrawVersion` clears the
 * pointer, so neither can be what the join lands on.
 *
 * This class re-implements none of it and issues no SQL of its own. What it adds
 * is the **completeness** rule the repository cannot express: one query returning
 * two rows for three required types is a perfectly valid query result and a
 * refusal.
 *
 * ### Why every incompleteness is one refusal
 *
 * Missing policy, unparseable policy, a required type with no effective version,
 * a required type with two, blank content, a missing hash — all raise
 * {@link DesignReviewTermsUnavailableError}. A customer must never be shown a
 * partial set: they would approve against terms the system could not later
 * verify, and `GRD-008` would refuse the very submission this read invited.
 * Substituting a superseded version, or quietly omitting a type, is the failure
 * mode this exists to make impossible.
 *
 * ### It reads and returns; it publishes nothing
 *
 * There is no transaction, no `ensureAgreement`, no `addVersion` and no
 * `publishVersion` reachable from the public read — bootstrap publication is
 * `PublishApp6AgreementsUseCase`, on the Admin-bearing CLI seam, and the module
 * that composes this surface exposes only the read side.
 */
import { Inject, Injectable } from '@nestjs/common';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import {
  AGREEMENT_REPOSITORY,
  type AgreementRepository,
  type AgreementVersion,
} from '../../../content/domain/repositories/agreement.repository';
import { DesignReviewTermsUnavailableError } from '../../domain/review/design-review.errors';
import { DesignApprovalAgreementsPolicyReader } from '../../infrastructure/policy/design-approval-agreements-policy.reader';

/** One required term, as the customer is shown it and as B11 will submit it. */
export interface EffectiveAgreementView {
  readonly agreementVersionId: string;
  readonly agreementType: string;
  /** `sha256:<64 hex>` — the exact value `GRD-008` binds acceptance to. */
  readonly contentHash: string;
  /** The customer-visible text of this exact version. */
  readonly content: string;
  readonly language: string;
  readonly version: number;
}

@Injectable()
export class EffectiveAgreementsReader {
  constructor(
    private readonly policies: DesignApprovalAgreementsPolicyReader,
    @Inject(AGREEMENT_REPOSITORY) private readonly agreements: AgreementRepository,
    private readonly clock: AuditClock,
  ) {}

  /**
   * The complete effective set, in the policy's published type order.
   *
   * Ordering is imposed here rather than taken from the query: `effectiveVersions`
   * issues one `IN (...)` and PostgreSQL guarantees no row order for it, so a
   * response built from the raw result would reorder itself between calls for no
   * reason a client could predict. The required-type list is the authority, and
   * it is also what `APP6-B11` will compare against.
   */
  async requireEffectiveSet(): Promise<EffectiveAgreementView[]> {
    const policy = await this.policies.require();
    const now = this.clock.now();

    const versions = await this.agreements.effectiveVersions(policy.requiredAgreementTypes, now);
    const byType = new Map<string, AgreementVersion[]>();
    for (const version of versions) {
      // Grouped by the *agreement's* type as the query matched it. The version
      // row carries no type of its own — `agreement_type` lives on the container
      // — so the grouping is rebuilt from the required list below rather than
      // read off the row, which is why `findByType` is consulted per type.
      const bucket = byType.get(version.agreementId) ?? [];
      bucket.push(version);
      byType.set(version.agreementId, bucket);
    }

    const set: EffectiveAgreementView[] = [];
    for (const agreementType of policy.requiredAgreementTypes) {
      set.push(await this.resolveOne(agreementType, byType));
    }
    return set;
  }

  /**
   * The one effective version of a type, or a refusal.
   *
   * The container is read to learn the type's `agreement_id`, because the
   * effective query returns version rows and TBL-069 carries no `agreement_type`
   * of its own (COL-TBL068-01 keeps the type on the header, where it is unique).
   * That read is not an extra authority: it names the row the join already went
   * through, and if it disagrees the outcome is the same refusal.
   */
  private async resolveOne(
    agreementType: string,
    byAgreementId: ReadonlyMap<string, AgreementVersion[]>,
  ): Promise<EffectiveAgreementView> {
    const container = await this.agreements.findByType(agreementType);
    if (container === undefined) {
      throw new DesignReviewTermsUnavailableError();
    }

    const candidates = byAgreementId.get(container.id) ?? [];
    // Exactly one. Zero is an unpublished or withdrawn term; more than one would
    // mean the publish transaction's supersede half did not hold, and picking
    // either would be choosing which terms a customer is bound by.
    if (candidates.length !== 1) {
      throw new DesignReviewTermsUnavailableError();
    }
    const version = candidates[0] as AgreementVersion;

    if (version.contentHash === undefined || version.content.trim() === '') {
      // Structurally unreachable — `ck_agreement_versions__content_hash_required_once_published`
      // and the NOT NULL on `content` both hold — and checked anyway, because
      // this is the last point before a hash a customer's approval will be bound
      // to leaves the server. An unusable term is a refusal, never a blank box.
      throw new DesignReviewTermsUnavailableError();
    }

    return {
      agreementVersionId: version.id,
      agreementType: container.agreementType,
      contentHash: version.contentHash,
      content: version.content,
      language: version.language,
      version: version.version,
    };
  }
}

/**
 * GRD-008, evaluated **inside** the approval transaction (`APP6-B11` §12).
 *
 * ```text
 * design_approval.agreements policy   → the required types, in published order
 * AgreementRepository.effectiveVersions(types, now)
 *                                     → the PUBLISHED, in-window, current row
 * submitted set                       → must be exactly those versions,
 *                                       with exactly those content hashes
 * ```
 *
 * ### Why the B10 read is not trusted again here
 *
 * `APP6-B10` resolved this same set to *show* the customer their terms, possibly
 * minutes or hours earlier. Between then and now an operator can publish a new
 * version of a required type, withdraw one, or change the required list itself.
 * An approval that bound whatever B10 happened to return would bind a customer
 * to terms that are no longer the terms — and, worse, would do it silently. So
 * the effective set is re-resolved from persistence at the approval instant and
 * the submission is compared against *that*.
 *
 * The consequence is deliberate and is the rule `APP6-B11` §12 states outright:
 * if the terms changed after the customer read them, the approval **fails**. The
 * customer must re-read and decide again. Substituting the new terms silently
 * would be the platform accepting an agreement on their behalf.
 *
 * ### Exactly, in both directions
 *
 * A missing required type, an extra agreement, a stale version id, a correct id
 * with a wrong hash, and the same agreement submitted twice are all one refusal.
 * The set equality is tested in both directions rather than by a subset check:
 * "everything required was submitted" alone would accept a submission that also
 * carried a withdrawn term, and "everything submitted is required" alone would
 * accept an empty body.
 *
 * ### The content hash is compared against persistence, never echoed
 *
 * The submitted `contentHash` is proof that the customer's screen rendered *this
 * exact text*. It is compared with the hash the agreement version row carries
 * and is then discarded in favour of the persisted value when the acceptance is
 * frozen: an approval must not be able to record a hash of its own choosing, and
 * copying the caller's string into `approval_snapshot_agreement_acceptances`
 * would let a client write its own evidence.
 *
 * ### The exact-design confirmation is not one of these
 *
 * There is no `DESIGN_APPROVAL_TERMS` here and no third pseudo-agreement.
 * `APP6-G01-C1` §5.2 rules the exact-design confirmation out of the agreement
 * model entirely: it is the approval action's own `versionId + documentHash`,
 * enforced by GRD-007 a few statements earlier in the same transaction.
 *
 * ### An unconfigurable deployment is a 503, not a refusal
 *
 * {@link EffectiveAgreementsReader} raises `DesignReviewTermsUnavailableError`
 * when the deployment cannot *state* the terms — an unpublished policy key, a
 * required type with no effective version, a required type with two. That is a
 * configuration fault with a live link and a real design behind it, and it
 * travels unchanged so the caller sees B10's bounded `503`. `TERMS_NOT_ACCEPTED`
 * is reserved for what the *caller* sent, which is the only half they can fix.
 */
import { Injectable } from '@nestjs/common';

import { designDecisionError } from '../../domain/review/design-decision.errors';
import type { AcceptedTermsEvidence } from '../../domain/review/design-approve-idempotency';
import { EffectiveAgreementsReader } from '../review/effective-agreements.reader';
import type { EffectiveAgreementView } from '../review/effective-agreements.reader';

/** One frozen acceptance, in the shape `ApprovalSnapshotRepository` takes. */
export interface FrozenAgreementAcceptance {
  readonly agreementVersionId: string;
  readonly agreementType: string;
  readonly contentHash: string;
}

@Injectable()
export class AcceptedTermsAuthority {
  constructor(private readonly agreements: EffectiveAgreementsReader) {}

  /**
   * Proves the submission is exactly the current effective set, and returns the
   * evidence to freeze.
   *
   * @requiresTransaction — the effective set must be the one that is true when
   * the snapshot commits, not one read before the transaction opened.
   */
  async requireExactAcceptance(
    submitted: readonly AcceptedTermsEvidence[],
  ): Promise<FrozenAgreementAcceptance[]> {
    const required = await this.agreements.requireEffectiveSet();

    const byId = new Map<string, AcceptedTermsEvidence>();
    for (const entry of submitted) {
      // A duplicate is refused rather than deduplicated. Two entries for one
      // agreement make "the customer accepted this once" ambiguous, and
      // collapsing them would let a submission whose count matched only because
      // of the duplicate pass the size test below.
      if (byId.has(entry.agreementVersionId)) {
        throw designDecisionError('TERMS_NOT_ACCEPTED');
      }
      byId.set(entry.agreementVersionId, entry);
    }

    // Size equality plus "every required one is present" is set equality: an
    // extra submitted agreement cannot hide inside a matching count once every
    // required id has been accounted for.
    if (byId.size !== required.length) {
      throw designDecisionError('TERMS_NOT_ACCEPTED');
    }

    return required.map((agreement) => this.matchOne(agreement, byId));
  }

  /** One required term, matched against what the customer sent. */
  private matchOne(
    required: EffectiveAgreementView,
    byId: ReadonlyMap<string, AcceptedTermsEvidence>,
  ): FrozenAgreementAcceptance {
    const entry = byId.get(required.agreementVersionId);
    // Missing entirely, or superseded since the customer read it — the id they
    // sent names a version that is no longer the effective one for its type.
    if (entry === undefined || entry.contentHash !== required.contentHash) {
      throw designDecisionError('TERMS_NOT_ACCEPTED');
    }

    return {
      agreementVersionId: required.agreementVersionId,
      // The type comes from the Agreement Version, never from the body:
      // `APP6-B11` §5 forbids accepting a type the server can derive, and a
      // caller-supplied one could label a payment policy as a return policy in
      // immutable evidence.
      agreementType: required.agreementType,
      // Persistence's hash, not the caller's — they are equal by the test above,
      // and only one of the two is authority.
      contentHash: required.contentHash,
    };
  }
}

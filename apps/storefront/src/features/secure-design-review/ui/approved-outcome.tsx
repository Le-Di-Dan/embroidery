'use client';

import type { DesignApprovedResponse } from '@embroidery/api-client';

import type { AgreementIdentity } from '../model/design-review-consent';
import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import { formatReviewInstant } from '../model/design-review-instant';

/**
 * The committed approval (`709:164`, `713:61`).
 *
 * ## Only customer-safe committed evidence
 *
 * Every value here came back from `APP6-B11`: the version that was approved,
 * the hash the snapshot froze, the snapshot id and the instant it committed.
 * Nothing is inferred and nothing is predicted.
 *
 * The response also carries `requestStatus` — the server's own projection of
 * the custom request — and it is deliberately **not** shown. It is read back so
 * the contract can state that a request moved without any screen having asked
 * it to; printing a lifecycle status to a customer would turn an internal
 * projection into a promise about what happens next.
 *
 * ## What it must never claim
 *
 * No payment was collected, no order was created, no stock was reserved, no
 * production began and no machine file was generated. APP6 ends at immutable
 * design evidence; APP7 is later. The scope sentence says so in as many words,
 * because a customer reading "approved" will otherwise assume all five.
 *
 * ## `replayed` is reported, not hidden
 *
 * A duplicate submission and a retry after a dropped response both answer with
 * the identical snapshot id and `replayed: true`. That is a success — the
 * decision is recorded exactly once — and saying so is more honest than showing
 * a fresh confirmation for something that committed earlier.
 */
export interface ApprovedOutcomeProps {
  readonly outcome: DesignApprovedResponse;
  /** The exact agreements the approval bound, from the captured intent. */
  readonly acceptedAgreements: readonly AgreementIdentity[];
}

export function ApprovedOutcome({ outcome, acceptedAgreements }: ApprovedOutcomeProps) {
  return (
    <section className="secure-design-review__outcome" data-testid="design-review-approved">
      <h2 className="secure-design-review__outcome-title">{COPY.approved.heading}</h2>

      <dl className="secure-design-review__outcome-facts">
        <div>
          <dt>{COPY.approved.versionLabel(outcome.version)}</dt>
          <dd>{COPY.approved.approvedAt(formatReviewInstant(outcome.approvedAt))}</dd>
        </div>
        <div>
          <dt>{COPY.approved.hashLabel}</dt>
          <dd className="secure-design-review__hash">{outcome.documentHash}</dd>
        </div>
        <div>
          <dt>{COPY.approved.snapshotLabel}</dt>
          <dd className="secure-design-review__hash">{outcome.approvalSnapshotId}</dd>
        </div>
      </dl>

      {acceptedAgreements.length === 0 ? null : (
        <div className="secure-design-review__outcome-terms">
          <p className="secure-design-review__outcome-terms-title">{COPY.approved.acceptedTerms}</p>
          <ul>
            {acceptedAgreements.map((agreement) => (
              <li key={agreement.agreementVersionId} className="secure-design-review__hash">
                {agreement.contentHash}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome.replayed ? (
        <p className="secure-design-review__outcome-note">{COPY.approved.replayed}</p>
      ) : null}

      <p className="secure-design-review__outcome-scope">{COPY.approved.scope}</p>
    </section>
  );
}

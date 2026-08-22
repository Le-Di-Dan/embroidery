'use client';

import type { DesignRevisionRequestedResponse } from '@embroidery/api-client';

import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import { formatReviewInstant } from '../model/design-review-instant';

/**
 * The committed revision request.
 *
 * `APP6-D01` draws no dedicated post-revision frame, so this is the smallest
 * truthful committed state derivable from `710:109` and the existing success
 * primitives — the same card shape as the approved outcome, with the facts the
 * server actually returned. No Figma node was invented and none was mutated.
 *
 * ## What it must never claim
 *
 * - **that a new design version exists.** `APP6-B11`'s revision path creates no
 *   draft; the workshop authors the next version, later, and nothing here knows
 *   when.
 * - **that the request left the design-review stage.** The response publishes
 *   `requestStatus` precisely so a screen cannot infer a move that never
 *   happened: no transition row is written and there is no self-transition.
 * - **that the workshop agreed to the change.** The decision recorded is the
 *   customer's, and the response says nothing about what the workshop will do
 *   with it.
 *
 * So the copy reports exactly two facts — the feedback was received, and the
 * version now carries the customer's decision — and predicts nothing.
 */
export interface RevisionRequestedOutcomeProps {
  readonly outcome: DesignRevisionRequestedResponse;
}

export function RevisionRequestedOutcome({ outcome }: RevisionRequestedOutcomeProps) {
  return (
    <section
      className="secure-design-review__outcome"
      data-testid="design-review-revision-requested"
    >
      <h2 className="secure-design-review__outcome-title">{COPY.revisionRequested.heading}</h2>

      <dl className="secure-design-review__outcome-facts">
        <div>
          <dt>{COPY.revisionRequested.versionLabel(outcome.version)}</dt>
          <dd>{COPY.revisionRequested.decidedAt(formatReviewInstant(outcome.decidedAt))}</dd>
        </div>
      </dl>

      <p className="secure-design-review__outcome-scope">{COPY.revisionRequested.scope}</p>
    </section>
  );
}

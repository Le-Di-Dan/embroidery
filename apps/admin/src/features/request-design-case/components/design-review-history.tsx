'use client';

import type { DesignVersionDetailReviewResponse } from '@embroidery/api-client';

import { presentInstant, presentReviewOutcome } from '../model/design-case-presentation';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';

interface DesignReviewHistoryProps {
  readonly reviews: readonly DesignVersionDetailReviewResponse[];
}

/**
 * The customer's decisions on the selected version (`APP6-A02` §15, `696:113`).
 *
 * ### The feedback is the customer's own words, verbatim
 *
 * `feedback` comes from the persisted decision record — never from an audit
 * summary, an outbox payload, the request's moderation notes or a guessed
 * sentence. It is rendered as **text**: React escapes it, so a customer who
 * typed something that looks like markup sees their own characters rather than
 * having them interpreted. Nothing sanitises it into an internal "reason" that
 * means something slightly different from what they wrote.
 *
 * ### An empty history is honest
 *
 * Before any decision there are no reviews, and saying so is correct. Nothing
 * synthesises an entry from the version's status: an `APPROVED` version with no
 * review row means the decision record has none, and inventing one would put a
 * decision in the history that no customer made.
 *
 * ### No Admin decision controls exist here
 *
 * There is no approve button and no request-revision button, because those are
 * the customer's actions through `APP6-B11`'s secure surface. This card reads.
 */
export function DesignReviewHistory({ reviews }: DesignReviewHistoryProps) {
  if (reviews.length === 0) {
    return (
      <p className="request-design-case__hint" data-testid="design-reviews-empty">
        {COPY.reviews.empty}
      </p>
    );
  }

  return (
    <ol className="request-design-case__reviews" data-testid="design-review-history">
      {reviews.map((review, index) => (
        <li
          key={`${review.decidedAt}-${String(index)}`}
          className="request-design-case__review"
          data-outcome={review.outcome}
        >
          <p className="request-design-case__review-outcome">
            {presentReviewOutcome(review.outcome)}
          </p>
          <p className="request-design-case__review-meta">
            {`${COPY.reviews.decidedAt}: ${presentInstant(review.decidedAt)}`}
          </p>
          {review.feedback === null ? (
            <p className="request-design-case__hint">{COPY.reviews.feedbackNone}</p>
          ) : (
            <figure className="request-design-case__feedback">
              <figcaption className="request-design-case__review-meta">
                {COPY.reviews.feedbackLabel}
              </figcaption>
              {/* Rendered as a text child, never with `dangerouslySetInnerHTML`. */}
              <blockquote
                className="request-design-case__feedback-body"
                data-testid="design-review-feedback"
              >
                {review.feedback}
              </blockquote>
            </figure>
          )}
        </li>
      ))}
    </ol>
  );
}

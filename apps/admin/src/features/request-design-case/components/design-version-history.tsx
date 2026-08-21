'use client';

import type { DesignVersionResponse } from '@embroidery/api-client';

import {
  presentInstant,
  presentReviewOutcome,
  presentVersionStatus,
} from '../model/design-case-presentation';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';

interface DesignVersionHistoryProps {
  readonly versions: readonly DesignVersionResponse[];
  readonly selectedVersionId: string | null;
  readonly isLoading: boolean;
  readonly onSelect: (versionId: string) => void;
}

/**
 * The design-version history (`APP6-A02` §14).
 *
 * ### Every version, in the server's order
 *
 * Nothing here sorts, filters, paginates or hides a row. `APP6-B08`'s list is
 * the history authority and returns versions oldest-first; superseded and void
 * ones stay visible, because a history that hid them could not explain how the
 * current version was arrived at.
 *
 * ### "Current" and "awaiting review" are two different columns' worth of truth
 *
 * `current` is read from the returned flag, whose authority is
 * `design_cases.current_version_id` — the **newest authored** version. The
 * version a customer is actually deciding on is the one in `SENT_FOR_REVIEW`,
 * and the two are routinely different rows: a workshop that has started the next
 * draft has advanced the pointer while the customer's review is still open.
 *
 * So the current marker reads *"bản mới nhất"* rather than anything about the
 * customer, and the awaiting-review state is shown by the row's own **status**.
 * Collapsing them into one "current" label is exactly the conflation `APP6-A02`
 * §14 forbids.
 *
 * ### Review outcomes are read, never inferred
 *
 * The outcome column renders what `reviews` actually contains. Nothing derives
 * an outcome from a version's status: an `APPROVED` status and an `APPROVE`
 * review row are different facts recorded at different moments, and
 * manufacturing the second from the first would put a decision in the history
 * that no customer made.
 *
 * ### Containment at 1280
 *
 * The table scrolls inside its own frame, per the Admin convention `APP5-A01`
 * set: the page itself never scrolls horizontally.
 */
export function DesignVersionHistory({
  versions,
  selectedVersionId,
  isLoading,
  onSelect,
}: DesignVersionHistoryProps) {
  if (isLoading) {
    return (
      <p className="request-design-case__hint" role="status" data-testid="design-versions-loading">
        {COPY.history.loading}
      </p>
    );
  }

  if (versions.length === 0) {
    // An empty history is a fact, not a failed read. The caller renders the
    // error state for a failure, and this is only reached on success.
    return (
      <p className="request-design-case__hint" data-testid="design-versions-empty">
        {COPY.history.empty}
      </p>
    );
  }

  return (
    <div className="request-design-case__table-frame">
      <table className="request-design-case__table" data-testid="design-version-history">
        <thead>
          <tr>
            <th scope="col">{COPY.history.columnVersion}</th>
            <th scope="col">{COPY.history.columnStatus}</th>
            <th scope="col">{COPY.history.columnCurrent}</th>
            <th scope="col">{COPY.history.columnReview}</th>
            <th scope="col">{COPY.history.columnSentAt}</th>
            <th scope="col">
              <span className="request-design-case__visually-hidden">{COPY.history.select}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const lastReview = version.reviews[version.reviews.length - 1];
            return (
              <tr
                key={version.versionId}
                data-selected={version.versionId === selectedVersionId}
                data-testid={`design-version-row-${version.versionId}`}
              >
                <th scope="row">{String(version.version)}</th>
                <td data-status={version.status}>{presentVersionStatus(version.status)}</td>
                <td>{version.current ? COPY.history.currentYes : COPY.history.currentNo}</td>
                <td>
                  {lastReview === undefined
                    ? COPY.history.reviewNone
                    : presentReviewOutcome(lastReview.outcome)}
                </td>
                <td>{presentInstant(version.sentAt)}</td>
                <td>
                  <button
                    className="request-design-case__button"
                    type="button"
                    onClick={() => {
                      onSelect(version.versionId);
                    }}
                    data-testid={`design-version-select-${version.versionId}`}
                  >
                    {COPY.history.select}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

'use client';

/**
 * The case header and the two participant cards — the part of
 * `/support/customer-access/merge/{caseId}` that reads the same in all three
 * states (`836:3`, `837:3`, `837:95`, and the 1280 reference `838:3`).
 *
 * ### The status comes from the server, always
 *
 * `status` is rendered from the case, never from whether a local mutation
 * resolved a moment ago. That is the whole reason the decisions re-read: a
 * screen that painted EXECUTED because its own request returned would show the
 * wrong thing the moment two operators act on one case.
 *
 * ### The direction is stated, and stated as unchangeable here
 *
 * Survivor and loser come from the case. There is no swap and no re-selection:
 * `POST …/execute` takes no body and cannot be told a different pair, so the
 * only way to change direction is to reject this case and open another — which
 * is what the note says, rather than leaving the operator to discover the
 * absence of a control.
 *
 * ### A participant card may be absent, and that is published, not broken
 *
 * `MergeParticipantResponse` is optional on both sides: `findDetailSummary`
 * answers `undefined` for a Customer row that is gone, and `APP10-B02` returns
 * the case anyway because the case is evidence in its own right. It cannot
 * happen through any delivered path — `REL-012` is `RESTRICT` and Customers are
 * anonymized rather than deleted — so the branch renders a plain sentence rather
 * than pretending to describe somebody.
 */
import { AdminCustomerMergeCaseResponseStatus } from '@embroidery/api-client';
import type { AdminCustomerMergeCaseResponse } from '@embroidery/api-client';

import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';
import { MergeParticipantCard } from './merge-participant-card';

const COPY = CUSTOMER_MERGE_COPY.caseDetail;

const STATUS_COPY: Readonly<Record<AdminCustomerMergeCaseResponse['status'], string>> = {
  [AdminCustomerMergeCaseResponseStatus.REQUESTED]: COPY.statusRequested,
  [AdminCustomerMergeCaseResponseStatus.EXECUTED]: COPY.statusExecuted,
  [AdminCustomerMergeCaseResponseStatus.REJECTED]: COPY.statusRejected,
};

interface MergeCaseSummaryProps {
  readonly mergeCase: AdminCustomerMergeCaseResponse;
}

export function MergeCaseSummary({ mergeCase }: MergeCaseSummaryProps) {
  return (
    <>
      <dl className="customer-merge__rows">
        <div className="customer-merge__row">
          <dt>{COPY.status}</dt>
          <dd>
            {/* The word is the status; the pill's tint only reinforces it. */}
            <span className="admin-status" data-testid="merge-case-status">
              {STATUS_COPY[mergeCase.status]}
            </span>
          </dd>
        </div>
        <div className="customer-merge__row">
          <dt>{COPY.caseReference}</dt>
          <dd data-testid="merge-case-reference">{mergeCase.mergeCaseId}</dd>
        </div>
        <div className="customer-merge__row">
          <dt>{COPY.requestedAt}</dt>
          <dd>
            <time dateTime={mergeCase.requestedAt}>
              {new Date(mergeCase.requestedAt).toLocaleString('vi-VN')}
            </time>
          </dd>
        </div>
        {mergeCase.decidedAt === undefined ? null : (
          <div className="customer-merge__row">
            <dt>{COPY.decidedAt}</dt>
            <dd data-testid="merge-case-decided-at">
              <time dateTime={mergeCase.decidedAt}>
                {new Date(mergeCase.decidedAt).toLocaleString('vi-VN')}
              </time>
            </dd>
          </div>
        )}
        <div className="customer-merge__row">
          <dt>{COPY.openReason}</dt>
          <dd data-testid="merge-case-open-reason">{mergeCase.reason}</dd>
        </div>
      </dl>

      <div className="customer-merge__slots">
        <section className="customer-merge-slot" data-role="survivor">
          <h3 className="customer-merge-slot__title">
            {CUSTOMER_MERGE_COPY.selection.survivorTitle}
          </h3>
          <p className="customer-merge-slot__meaning">
            {CUSTOMER_MERGE_COPY.selection.survivorMeaning}
          </p>
          {mergeCase.survivor === undefined ? (
            <p className="customer-merge-slot__empty" data-testid="merge-case-survivor-absent">
              {CUSTOMER_MERGE_COPY.selection.empty}
            </p>
          ) : (
            <MergeParticipantCard
              role="survivor"
              participant={mergeCase.survivor}
              testId="merge-case-survivor"
            />
          )}
        </section>

        <section className="customer-merge-slot" data-role="loser">
          <h3 className="customer-merge-slot__title">{CUSTOMER_MERGE_COPY.selection.loserTitle}</h3>
          <p className="customer-merge-slot__meaning">
            {CUSTOMER_MERGE_COPY.selection.loserMeaning}
          </p>
          {mergeCase.loser === undefined ? (
            <p className="customer-merge-slot__empty" data-testid="merge-case-loser-absent">
              {CUSTOMER_MERGE_COPY.selection.empty}
            </p>
          ) : (
            <MergeParticipantCard
              role="loser"
              participant={mergeCase.loser}
              testId="merge-case-loser"
            />
          )}
        </section>
      </div>

      <p className="customer-merge__note">{COPY.directionNote}</p>
      <p className="customer-merge__note">{CUSTOMER_MERGE_COPY.selection.maskNote}</p>
    </>
  );
}

'use client';

/**
 * The reject confirmation (`FIG-APP10-A02-REJECT-CONFIRM` `841:45`,
 * `…-REJECT-CONFLICT` `841:66`).
 *
 * ### The reason is required, and the dialog says where it goes
 *
 * `APP10-B02` requires it and bounds it at 1000. It is recorded in
 * `audit_events.reason` against the case, together with the Admin session that
 * supplied it — and the hint says so, including that it is **not shown again on
 * this screen**. `customer_merge_cases` has one reason column and it holds why
 * the case was raised, so there is no published read for the declining reason.
 * Telling the operator that before they type is more useful than an empty field
 * afterwards that they would read as missing data.
 *
 * ### Rejection is not idempotent, and the conflict says why
 *
 * A second rejection of a decided case is a 409 rather than a quiet success,
 * because the second operator's words would otherwise be silently discarded. The
 * conflict copy states that the case was already decided.
 *
 * ### Rejecting changes neither Customer
 *
 * The body says so explicitly: no contact moves, no grant is revoked, nothing is
 * repointed. A lifecycle decision and nothing else.
 */
import { useState } from 'react';

import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';
import type { RejectMergeFailure } from '../model/customer-merge-failure';
import { MERGE_REASON_MAX_LENGTH, type ReasonProblem } from '../model/merge-reason';
import { MergeDialog } from './merge-dialog';

const COPY = CUSTOMER_MERGE_COPY.reject;

const FAILURE_COPY: Readonly<Record<RejectMergeFailure, string>> = {
  validation: CUSTOMER_MERGE_COPY.rejectFailure.validation,
  'already-decided': CUSTOMER_MERGE_COPY.rejectFailure.alreadyDecided,
  stale: CUSTOMER_MERGE_COPY.rejectFailure.stale,
  unauthenticated: CUSTOMER_MERGE_COPY.rejectFailure.unauthenticated,
  forbidden: CUSTOMER_MERGE_COPY.rejectFailure.forbidden,
  generic: CUSTOMER_MERGE_COPY.rejectFailure.generic,
};

const PROBLEM_COPY: Readonly<Record<ReasonProblem, string>> = {
  blank: COPY.reasonBlank,
  'too-long': COPY.reasonTooLong,
};

interface MergeRejectDialogProps {
  readonly busy: boolean;
  readonly succeeded: boolean;
  readonly problem: ReasonProblem | null;
  readonly failure: RejectMergeFailure | null;
  readonly onConfirm: (reason: string) => void;
  readonly onClose: () => void;
}

export function MergeRejectDialog({
  busy,
  succeeded,
  problem,
  failure,
  onConfirm,
  onClose,
}: MergeRejectDialogProps) {
  const [reason, setReason] = useState('');
  const bodyId = 'merge-reject-dialog-body';
  const hintId = 'merge-reject-reason-hint';
  const errorId = 'merge-reject-reason-error';
  const settled = succeeded || failure !== null;

  return (
    <MergeDialog
      title={succeeded ? COPY.successTitle : COPY.title}
      describedBy={bodyId}
      testId="merge-reject-dialog"
      onDismiss={onClose}
    >
      <p className="customer-merge-dialog__body" id={bodyId}>
        {succeeded ? COPY.successBody : COPY.body}
      </p>

      {settled ? null : (
        <>
          <label className="admin-field__label" htmlFor="merge-reject-reason">
            {COPY.reasonLabel}
          </label>
          <textarea
            id="merge-reject-reason"
            className="customer-merge__reason"
            data-testid="merge-reject-reason"
            value={reason}
            rows={3}
            maxLength={MERGE_REASON_MAX_LENGTH}
            disabled={busy}
            aria-describedby={problem === null ? hintId : `${hintId} ${errorId}`}
            aria-invalid={problem !== null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <p className="customer-merge__hint" id={hintId}>
            {COPY.reasonHint}
          </p>
          {problem === null ? null : (
            <p
              className="customer-merge-dialog__error"
              id={errorId}
              role="alert"
              data-testid="merge-reject-problem"
            >
              {PROBLEM_COPY[problem]}
            </p>
          )}
        </>
      )}

      {failure === null ? null : (
        <p className="customer-merge-dialog__error" role="alert" data-testid="merge-reject-error">
          {FAILURE_COPY[failure]}
        </p>
      )}

      <div className="customer-merge-dialog__actions">
        {settled ? null : (
          <button
            type="button"
            className="customer-merge__danger"
            data-testid="merge-reject-confirm"
            disabled={busy}
            onClick={() => {
              onConfirm(reason);
            }}
          >
            {busy ? COPY.working : COPY.confirm}
          </button>
        )}
        <button
          type="button"
          className="customer-merge__secondary"
          data-testid="merge-reject-cancel"
          disabled={busy}
          onClick={onClose}
        >
          {settled ? COPY.close : COPY.cancel}
        </button>
      </div>
    </MergeDialog>
  );
}

'use client';

/**
 * The execute confirmation (`FIG-APP10-A02-EXECUTE-CONFIRM` `840:40`,
 * `…-PENDING` `840:74`, `…-ALREADYEXECUTED` `840:93`, `…-PROFILECONFLICT`
 * `840:110`, `…-PARTICIPANT-REFUSED` `841:3`, `…-FAILURE` `841:24`).
 *
 * ### The confirmation restates the whole consequence, in words
 *
 * Which Customer survives, which is merged away, that contacts and live
 * ownership move, that active secure-access grants are revoked, and that frozen
 * evidence is **preserved rather than rewritten**. The last one matters most: an
 * operator who assumed a merge rewrites history would read an approval snapshot
 * against the old Customer as a bug rather than as the design.
 *
 * It also says plainly that there is no unmerge. `APP10-B03` publishes no such
 * operation, so nothing here may imply the decision can be taken back.
 *
 * ### The direction comes from the case and cannot be flipped here
 *
 * The two names are rendered from the case's own participants. There is no swap
 * control: `POST …/execute` takes no body and cannot be told to merge a
 * different pair, and offering a swap in a confirmation would suggest a
 * capability the API refuses to have.
 *
 * ### `ALREADY_EXECUTED` is a completion
 *
 * It gets its own wording — the request resolved to the merge that already
 * happened, nothing moved twice — and is styled as a finish, not a failure.
 */
import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';
import type { ExecuteMergeFailure } from '../model/customer-merge-failure';
import type { ExecuteOutcome } from '../hooks/use-merge-decision';
import { MergeDialog } from './merge-dialog';

const COPY = CUSTOMER_MERGE_COPY.execute;

const FAILURE_COPY: Readonly<Record<ExecuteMergeFailure, string>> = {
  'business-profile': CUSTOMER_MERGE_COPY.executeFailure.businessProfile,
  'not-executable': CUSTOMER_MERGE_COPY.executeFailure.notExecutable,
  'participant-or-contact': CUSTOMER_MERGE_COPY.executeFailure.participantOrContact,
  stale: CUSTOMER_MERGE_COPY.executeFailure.stale,
  unauthenticated: CUSTOMER_MERGE_COPY.executeFailure.unauthenticated,
  forbidden: CUSTOMER_MERGE_COPY.executeFailure.forbidden,
  generic: CUSTOMER_MERGE_COPY.executeFailure.generic,
};

interface MergeExecuteDialogProps {
  readonly survivorName: string;
  readonly loserName: string;
  readonly busy: boolean;
  readonly outcome: ExecuteOutcome | null;
  readonly failure: ExecuteMergeFailure | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function MergeExecuteDialog({
  survivorName,
  loserName,
  busy,
  outcome,
  failure,
  onConfirm,
  onClose,
}: MergeExecuteDialogProps) {
  const bodyId = 'merge-execute-dialog-body';
  const settled = outcome !== null || failure !== null;
  const title =
    outcome === 'ALREADY_EXECUTED'
      ? COPY.alreadyTitle
      : outcome === 'EXECUTED'
        ? COPY.successTitle
        : COPY.title;

  return (
    <MergeDialog
      title={title}
      describedBy={bodyId}
      testId="merge-execute-dialog"
      onDismiss={onClose}
    >
      <dl className="customer-merge-dialog__pair" data-testid="merge-execute-pair">
        <div className="customer-merge-dialog__pair-row">
          <dt>{COPY.survivorLabel}</dt>
          <dd data-testid="merge-execute-survivor">{survivorName}</dd>
        </div>
        <div className="customer-merge-dialog__pair-row">
          <dt>{COPY.loserLabel}</dt>
          <dd data-testid="merge-execute-loser">{loserName}</dd>
        </div>
      </dl>

      <p className="customer-merge-dialog__body" id={bodyId}>
        {outcome === 'ALREADY_EXECUTED'
          ? COPY.alreadyBody
          : outcome === 'EXECUTED'
            ? COPY.successBody
            : COPY.direction}
      </p>

      {settled ? null : (
        <>
          <p className="customer-merge-dialog__lead">{COPY.effects}</p>
          <ul className="customer-merge-dialog__effects" data-testid="merge-execute-effects">
            <li>{COPY.effectContacts}</li>
            <li>{COPY.effectOwnership}</li>
            <li>{COPY.effectGrants}</li>
            <li>{COPY.effectFrozen}</li>
          </ul>
          <p className="customer-merge-dialog__warning" data-testid="merge-execute-irreversible">
            {COPY.irreversible}
          </p>
        </>
      )}

      {failure === null ? null : (
        <p className="customer-merge-dialog__error" role="alert" data-testid="merge-execute-error">
          {FAILURE_COPY[failure]}
        </p>
      )}

      <div className="customer-merge-dialog__actions">
        {settled ? null : (
          <button
            type="button"
            className="customer-merge__danger"
            data-testid="merge-execute-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? COPY.working : COPY.confirm}
          </button>
        )}
        <button
          type="button"
          className="customer-merge__secondary"
          data-testid="merge-execute-cancel"
          disabled={busy}
          onClick={onClose}
        >
          {settled ? COPY.close : COPY.cancel}
        </button>
      </div>
    </MergeDialog>
  );
}

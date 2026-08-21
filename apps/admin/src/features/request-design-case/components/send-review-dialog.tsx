'use client';

import type { SendFailure } from '../model/request-design-case-failure';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';
import { DesignDialog } from './design-dialog';

interface SendReviewDialogProps {
  /** The exact version this dialog was opened for. Never re-derived. */
  readonly versionId: string;
  readonly versionNumber: number;
  readonly running: boolean;
  readonly failure: SendFailure | null;
  readonly onConfirm: (versionId: string) => void;
  readonly onDismiss: () => void;
}

/**
 * `695:138` — the send-for-review confirmation.
 *
 * ### The dialog is bound to one version id
 *
 * `versionId` is a prop, captured when the dialog opened, and `onConfirm` is
 * handed that same value. The sentence names the same version number the
 * operator is looking at. Nothing recomputes "the current draft" between reading
 * that number and the request going out — which is the gap through which a
 * screen sends a version nobody looked at.
 *
 * ### It does not claim to move the request
 *
 * The wording says a design version is being sent for the customer to review.
 * `APP6-B09` may project the request to `DESIGN_REVIEW` as a consequence of that
 * send, but the operator is not setting a request status and is not told they
 * are.
 *
 * `REVIEW_ALREADY_ACTIVE` is deliberately **not** rendered here: it is not a
 * dialog-level validation error but a statement that the world differs from what
 * the operator assumed, so the screen closes this dialog and shows the
 * reconciliation state instead.
 */
export function SendReviewDialog({
  versionId,
  versionNumber,
  running,
  failure,
  onConfirm,
  onDismiss,
}: SendReviewDialogProps) {
  const message =
    failure === null
      ? null
      : failure === 'stale'
        ? COPY.send.errorStale
        : failure === 'unauthenticated'
          ? COPY.send.errorUnauthenticated
          : COPY.send.errorRetryable;

  return (
    <DesignDialog
      title={COPY.send.title}
      busy={running}
      onDismiss={onDismiss}
      testId="design-send-dialog"
    >
      <p className="request-design-case__dialog-body">{COPY.send.body(versionNumber)}</p>
      <p className="request-design-case__hint">{COPY.send.note}</p>

      {message === null ? null : (
        <p className="request-design-case__error" role="alert" data-testid="design-send-error">
          {message}
        </p>
      )}

      <div className="request-design-case__dialog-actions">
        <button
          className="request-design-case__button"
          type="button"
          disabled={running}
          onClick={onDismiss}
        >
          {COPY.send.cancel}
        </button>
        <button
          className="request-design-case__button request-design-case__button--primary"
          type="button"
          disabled={running}
          aria-busy={running}
          data-testid="design-send-confirm"
          onClick={() => {
            onConfirm(versionId);
          }}
        >
          {running ? COPY.send.sending : COPY.send.confirm}
        </button>
      </div>
    </DesignDialog>
  );
}

interface ReviewAlreadyActiveNoticeProps {
  readonly onDismiss: () => void;
}

/**
 * `695:266` — the `REVIEW_ALREADY_ACTIVE` reconciliation.
 *
 * Server truth, stated plainly: another version of this design case is already
 * awaiting a decision, **nothing was written**, and the screen has re-read.
 * There is exactly one exit, and it is an acknowledgement.
 *
 * What this deliberately does not offer: no supersede-the-other-review, no
 * send-another-version, no select-latest and no retry. Each would be the client
 * deciding something `GRD-004` exists to arbitrate. No constraint name and no
 * database detail appears either — the operator learns what is true, not how it
 * is enforced.
 */
export function ReviewAlreadyActiveNotice({ onDismiss }: ReviewAlreadyActiveNoticeProps) {
  return (
    <div
      className="request-design-case__notice"
      role="alert"
      data-tone="conflict"
      data-testid="design-review-already-active"
    >
      <h3 className="request-design-case__notice-title">{COPY.reviewActive.title}</h3>
      <p>{COPY.reviewActive.body}</p>
      <p>{COPY.reviewActive.guidance}</p>
      <button className="request-design-case__button" type="button" onClick={onDismiss}>
        {COPY.reviewActive.dismiss}
      </button>
    </div>
  );
}

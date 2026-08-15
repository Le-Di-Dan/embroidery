'use client';

import { useId, useState } from 'react';

import { CUSTOMER_ACCESS_COPY, REVOKE_REASON_MAX_LENGTH } from '../model/customer-access-copy';
import { validateRevokeReason, type ReasonProblem } from '../model/revoke-reason';
import { SupportDialog } from './support-dialog';

interface RevokeDialogProps {
  readonly busy: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}

const COPY = CUSTOMER_ACCESS_COPY.revoke;

/**
 * The revoke confirmation: destructive, reason-bearing, and validated here.
 *
 * The reason is required before the request is sent rather than left for the
 * server to refuse, because this is the only place the problem can be shown next
 * to the field being typed in. It is trimmed — a reason of spaces satisfies
 * "required" and none of its purpose — and the trimmed value is what travels, so
 * the audit trail never records whitespace the operator did not mean.
 *
 * The field is bound to its validation through `aria-describedby` and
 * `aria-invalid`, so the problem is announced rather than only coloured, and the
 * error carries `role="alert"` so it reaches a screen reader when it appears.
 *
 * Both buttons disable while the request is in flight. That is what stops a
 * second confirm producing a second revoke, and it is why the dialog reports
 * "đang thu hồi…" rather than closing optimistically — the grant is not revoked
 * until the server says it is.
 */
export function RevokeDialog({ busy, onConfirm, onCancel }: RevokeDialogProps) {
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<ReasonProblem | null>(null);
  const fieldId = useId();
  const hintId = 'revoke-reason-hint';
  const errorId = 'revoke-reason-error';

  const submit = () => {
    const validated = validateRevokeReason(reason);
    if (!validated.ok) {
      setProblem(validated.problem);
      return;
    }
    setProblem(null);
    onConfirm(validated.value);
  };

  return (
    <SupportDialog
      title={COPY.title}
      describedBy="revoke-dialog-body"
      testId="revoke-dialog"
      destructive
      onDismiss={onCancel}
    >
      <p className="customer-access-dialog__body" id="revoke-dialog-body">
        {COPY.body}
      </p>

      <label className="customer-access-dialog__label" htmlFor={fieldId}>
        {COPY.reasonLabel}
      </label>
      <textarea
        id={fieldId}
        className="customer-access-dialog__reason"
        data-testid="revoke-reason"
        value={reason}
        maxLength={REVOKE_REASON_MAX_LENGTH}
        rows={3}
        aria-describedby={problem === null ? hintId : `${hintId} ${errorId}`}
        aria-invalid={problem !== null}
        disabled={busy}
        onChange={(event) => {
          setReason(event.target.value);
          if (problem !== null) setProblem(null);
        }}
      />
      <p className="customer-access-dialog__hint" id={hintId}>
        {COPY.reasonHint}
      </p>
      {problem === null ? null : (
        <p className="customer-access-dialog__error" id={errorId} role="alert">
          {problem === 'blank' ? COPY.reasonBlank : COPY.reasonTooLong}
        </p>
      )}

      <div className="customer-access-dialog__actions">
        <button
          type="button"
          className="customer-access-dialog__danger"
          data-testid="revoke-confirm"
          disabled={busy}
          onClick={submit}
        >
          {busy ? COPY.working : COPY.confirm}
        </button>
        <button
          type="button"
          className="customer-access-dialog__secondary"
          data-testid="revoke-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          {COPY.cancel}
        </button>
      </div>
    </SupportDialog>
  );
}

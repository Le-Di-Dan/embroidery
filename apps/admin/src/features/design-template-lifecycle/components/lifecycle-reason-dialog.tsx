'use client';

import { useId, useState } from 'react';

import { REASON_MAX_LENGTH, validateReason, type ReasonProblem } from '../model/lifecycle-actions';
import { LIFECYCLE_COPY } from '../model/lifecycle-copy';
import { LifecycleDialog } from './lifecycle-dialog';

interface LifecycleReasonDialogProps {
  readonly badge: string;
  readonly title: string;
  readonly body: string;
  readonly reasonLabel: string;
  readonly reasonHint: string;
  readonly confirmLabel: string;
  readonly testId: string;
  /** Archive retires a Template from every Studio; restore undoes a retirement. */
  readonly destructive: boolean;
  readonly busy: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}

/**
 * The two reason-bearing confirmations: archive and restore.
 *
 * `IMP-D042` PO-03 requires a reason for exactly these two, and it is written
 * verbatim into the audit trail — which is why it is validated here, before the
 * command is sent, rather than left for the server to reject. Trimmed and
 * non-empty: a reason of spaces satisfies "required" and none of its purpose.
 *
 * The field is bound to its validation through `aria-describedby` and
 * `aria-invalid`, so the problem is announced rather than only coloured.
 */
export function LifecycleReasonDialog({
  badge,
  title,
  body,
  reasonLabel,
  reasonHint,
  confirmLabel,
  testId,
  destructive,
  busy,
  onConfirm,
  onCancel,
}: LifecycleReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<ReasonProblem | null>(null);
  const fieldId = useId();
  const hintId = `${testId}-hint`;
  const errorId = `${testId}-error`;

  const submit = () => {
    const validated = validateReason(reason);
    if (!validated.ok) {
      setProblem(validated.problem);
      return;
    }
    setProblem(null);
    onConfirm(validated.value);
  };

  return (
    <LifecycleDialog
      title={title}
      describedBy={`${testId}-body`}
      testId={testId}
      destructive={destructive}
      onDismiss={onCancel}
    >
      <p className="template-lifecycle-dialog__badge" data-destructive={destructive}>
        {badge}
      </p>
      <p className="template-lifecycle-dialog__body" id={`${testId}-body`}>
        {body}
      </p>

      <label className="template-lifecycle-dialog__label" htmlFor={fieldId}>
        {reasonLabel}
      </label>
      <textarea
        id={fieldId}
        className="template-lifecycle-dialog__reason"
        data-testid={`${testId}-reason`}
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        rows={3}
        aria-describedby={problem === null ? hintId : `${hintId} ${errorId}`}
        aria-invalid={problem !== null}
        disabled={busy}
        onChange={(event) => {
          setReason(event.target.value);
          if (problem !== null) setProblem(null);
        }}
      />
      <p className="template-lifecycle-dialog__hint" id={hintId}>
        {reasonHint}
      </p>
      {problem === null ? null : (
        <p className="template-lifecycle-dialog__error" id={errorId} role="alert">
          {problem === 'blank' ? LIFECYCLE_COPY.reason.blank : LIFECYCLE_COPY.reason.tooLong}
        </p>
      )}

      <div className="template-lifecycle-dialog__actions">
        <button
          type="button"
          className={
            destructive ? 'template-lifecycle-dialog__danger' : 'template-lifecycle-dialog__primary'
          }
          data-testid={`${testId}-confirm`}
          disabled={busy}
          onClick={submit}
        >
          {busy ? LIFECYCLE_COPY.outcome.working : confirmLabel}
        </button>
        <button
          type="button"
          className="template-lifecycle-dialog__secondary"
          data-testid={`${testId}-cancel`}
          disabled={busy}
          onClick={onCancel}
        >
          {LIFECYCLE_COPY.archiveDialog.cancel}
        </button>
      </div>
    </LifecycleDialog>
  );
}

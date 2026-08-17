'use client';

import { useState } from 'react';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import type { ModerationAction } from '../model/moderation-actions';
import {
  EMPTY_MODERATION_FORM,
  hasValidationErrors,
  REJECT_NOTE_KINDS,
  validateModerationForm,
  type ModerationFormErrors,
  type ModerationFormValues,
  type ModerationNoteKind,
} from '../model/moderation-command';
import { ModerationDialog } from './moderation-dialog';
import { ModerationTextArea } from './moderation-text-area';

interface ModerationTransitionDialogProps {
  readonly action: ModerationAction;
  readonly running: boolean;
  /** True when a recoverable failure means the typed text must survive. */
  readonly failed: boolean;
  readonly onSubmit: (values: ModerationFormValues) => void;
  readonly onDismiss: () => void;
}

const TITLES: Readonly<Record<string, string>> = {
  clarify: COPY.dialog.clarifyTitle,
  reject: COPY.dialog.rejectTitle,
  cancel: COPY.dialog.cancelTitle,
};

const HELP: Readonly<Record<string, string>> = {
  clarify: COPY.dialog.clarifyHelp,
  reject: COPY.dialog.rejectHelp,
  cancel: COPY.dialog.cancelHelp,
};

const NOTE_KIND_LABELS: Readonly<Record<ModerationNoteKind, string>> = {
  REJECT: COPY.dialog.rejectKindReject,
  SPAM: COPY.dialog.rejectKindSpam,
  CLARIFY: COPY.notes.kindClarify,
  NOTE: COPY.notes.kindNote,
};

/**
 * The clarification, rejection and cancellation dialogs (`669:3`, `669:60`,
 * `669:119`), their validation state (`669:173`) and their submitting state
 * (`670:3`).
 *
 * ### Two inputs, and neither is ever copied into the other
 *
 * The internal reason and the customer-visible text are separate controls with
 * separate labels saying exactly who reads each. There is no "same as above"
 * affordance and no defaulting between them: `APP5-B03` publishes the
 * customer-visible field to the customer's own status page, so a convenience
 * that copied an internal assessment across would publish it.
 *
 * ### `SPAM` is never a default
 *
 * The rejection kind is a radio group with `REJECT` preselected. Both are
 * refusals, but `SPAM` is an accusation about the customer rather than a verdict
 * about the request, and it stays an explicit choice the operator makes.
 * `PAUSE` is not offered at all — APP5 has no transition that pauses anything,
 * so the kind would record a decision the lifecycle cannot carry out.
 *
 * ### Submitting cannot double-fire
 *
 * The submit control is disabled in flight and the hook behind it drops a second
 * call synchronously, so neither a double-click nor a repeated `Enter` becomes a
 * second transition. Nothing retries automatically.
 */
export function ModerationTransitionDialog({
  action,
  running,
  failed,
  onSubmit,
  onDismiss,
}: ModerationTransitionDialogProps) {
  const [values, setValues] = useState<ModerationFormValues>(EMPTY_MODERATION_FORM);
  const [errors, setErrors] = useState<ModerationFormErrors>({});
  const surface = action.surface;
  const noteRequired = surface === 'clarify' || surface === 'reject';

  const update = (patch: Partial<ModerationFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    if (running) return;
    const found = validateModerationForm(surface, values);
    setErrors(found);
    if (hasValidationErrors(found)) return;
    onSubmit(values);
  };

  return (
    <ModerationDialog
      title={TITLES[surface] ?? action.label}
      describedBy="moderation-dialog-help"
      testId={`moderation-dialog-${surface}`}
      destructive={surface !== 'clarify'}
      onDismiss={() => {
        // A dismiss mid-flight would leave a command running with nothing on
        // screen to report its outcome.
        if (!running) onDismiss();
      }}
    >
      <p className="moderation-dialog__help" id="moderation-dialog-help">
        {HELP[surface] ?? ''}
      </p>

      {hasValidationErrors(errors) ? (
        <p
          className="moderation-dialog__validation"
          role="alert"
          data-testid="moderation-validation"
        >
          {COPY.validation.heading}
        </p>
      ) : null}

      {failed ? (
        <div className="moderation-dialog__failure" role="alert" data-testid="moderation-failure">
          <p className="moderation-dialog__failure-title">{COPY.outcome.failureHeading}</p>
          {/* The typed text is still in state — nothing has to be retyped. */}
          <p className="moderation-dialog__failure-body">{COPY.outcome.failureBody}</p>
        </div>
      ) : null}

      <ModerationTextArea
        label={COPY.reason.internal}
        value={values.internalReason}
        onChange={(internalReason) => update({ internalReason })}
        disabled={running}
        testId="moderation-internal-reason"
        {...(errors.internalReason === undefined ? {} : { error: errors.internalReason })}
      />

      <ModerationTextArea
        label={COPY.reason.customerVisible}
        value={values.customerVisibleReason}
        onChange={(customerVisibleReason) => update({ customerVisibleReason })}
        disabled={running}
        testId="moderation-customer-reason"
        {...(errors.customerVisibleReason === undefined
          ? {}
          : { error: errors.customerVisibleReason })}
      />

      {surface === 'reject' ? (
        <fieldset className="moderation-dialog__kinds" disabled={running}>
          <legend className="moderation-field__label">{COPY.dialog.noteKindLabel}</legend>
          {REJECT_NOTE_KINDS.map((kind) => (
            <label className="moderation-dialog__kind" key={kind}>
              <input
                type="radio"
                name="reject-note-kind"
                value={kind}
                checked={values.rejectNoteKind === kind}
                data-testid={`moderation-note-kind-${kind.toLowerCase()}`}
                onChange={() => update({ rejectNoteKind: kind })}
              />
              {NOTE_KIND_LABELS[kind]}
            </label>
          ))}
        </fieldset>
      ) : null}

      <ModerationTextArea
        label={noteRequired ? COPY.dialog.noteLabel : COPY.dialog.noteOptionalLabel}
        value={values.note}
        onChange={(note) => update({ note })}
        disabled={running}
        testId="moderation-note"
        {...(errors.note === undefined ? {} : { error: errors.note })}
      />

      <p className="moderation-dialog__sr-status" role="status" aria-live="polite">
        {running ? COPY.dialog.submitting : ''}
      </p>

      <div className="moderation-dialog__actions">
        <button
          type="button"
          className="moderation-dialog__submit"
          disabled={running}
          data-testid="moderation-submit"
          onClick={submit}
        >
          {running ? COPY.dialog.submitting : COPY.actions.confirm}
        </button>
        <button
          type="button"
          className="moderation-dialog__dismiss"
          disabled={running}
          data-testid="moderation-dismiss"
          onClick={onDismiss}
        >
          {COPY.actions.dismiss}
        </button>
      </div>
    </ModerationDialog>
  );
}

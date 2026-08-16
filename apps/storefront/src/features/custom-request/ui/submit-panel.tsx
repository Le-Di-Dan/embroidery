'use client';

/**
 * The submit action and its five outcomes (`656:74`, `656:119`, `656:166`,
 * `656:213`).
 *
 * ## Why the button is disabled by two different facts
 *
 * `disabled={!ready || isSubmitting}` mixes two things on purpose. `!ready` is
 * "the form is incomplete" and is explained by the message beneath it.
 * `isSubmitting` is "this has already been sent", which is the duplicate-safe
 * half — and it is deliberately *not* the only such mechanism: the submission
 * hook refuses a second call before the first settles, because a disabled
 * attribute is a render behind the second click of a double-click.
 *
 * ## Conflict is the one outcome with no retry
 *
 * Every other refusal leaves the challenge usable, and re-sending the same body
 * is a replay rather than a duplicate. `CONFLICT` means this verification is
 * spent on a *different* request, so the only honest way forward is a fresh
 * verification — offered as an explicit action, never started automatically
 * (`APP5-S01` §15).
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import { isRetryable, type SubmissionOutcome } from '../model/submission-outcome';

export interface SubmitPanelProps {
  readonly ready: boolean;
  readonly isSubmitting: boolean;
  readonly outcome: SubmissionOutcome | undefined;
  readonly onSubmit: () => void;
  /** Sends the customer back to step 2 for a new verification. */
  readonly onRestartVerification: () => void;
}

const MESSAGE_OF: Readonly<Record<SubmissionOutcome, string>> = {
  FAILED: CUSTOM_REQUEST_COPY.submit.failed,
  UNCERTAIN: CUSTOM_REQUEST_COPY.submit.uncertain,
  CONFLICT: CUSTOM_REQUEST_COPY.submit.conflict,
  IN_PROGRESS: CUSTOM_REQUEST_COPY.submit.inProgress,
  NOT_VERIFIED: CUSTOM_REQUEST_COPY.submit.notVerified,
  SESSION_UNUSABLE: CUSTOM_REQUEST_COPY.catalog.sessionExpired,
  ASSET_NOT_BINDABLE: CUSTOM_REQUEST_COPY.submit.assetNotBindable,
  SUBJECT_INVALID: CUSTOM_REQUEST_COPY.submit.subjectInvalid,
};

export function SubmitPanel({
  ready,
  isSubmitting,
  outcome,
  onSubmit,
  onRestartVerification,
}: SubmitPanelProps) {
  const blockedId = 'submit-blocked';

  return (
    <div className="custom-request__submit">
      {/*
        In-flight is announced, not only drawn: the approved submitting frame
        replaces the label, which a screen reader would otherwise experience as
        a button that simply stopped responding.
      */}
      <p className="custom-request__visually-hidden" aria-live="polite">
        {isSubmitting ? CUSTOM_REQUEST_COPY.live.submitting : ''}
      </p>

      <button
        type="button"
        className="custom-request__button custom-request__button--primary"
        disabled={!ready || isSubmitting}
        {...(ready ? {} : { 'aria-describedby': blockedId })}
        onClick={onSubmit}
      >
        {isSubmitting ? CUSTOM_REQUEST_COPY.submit.submitting : CUSTOM_REQUEST_COPY.submit.action}
      </button>

      {ready ? null : (
        <p id={blockedId} className="custom-request__hint">
          {CUSTOM_REQUEST_COPY.submit.blocked}
        </p>
      )}

      {outcome === undefined ? null : (
        <div className="custom-request__notice" role="alert">
          <p className="custom-request__error">{MESSAGE_OF[outcome]}</p>

          {isRetryable(outcome) ? (
            <button
              type="button"
              className="custom-request__button"
              disabled={isSubmitting}
              onClick={onSubmit}
            >
              {CUSTOM_REQUEST_COPY.submit.retry}
            </button>
          ) : (
            <button
              type="button"
              className="custom-request__button"
              onClick={onRestartVerification}
            >
              {CUSTOM_REQUEST_COPY.submit.conflictAction}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

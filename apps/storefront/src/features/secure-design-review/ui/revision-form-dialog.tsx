'use client';

import { useId, useState } from 'react';

import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import { REVISION_FEEDBACK_MAX, revisionFeedbackProblem } from '../model/design-review-state';
import { ReviewDialog } from './review-dialog';

/**
 * The revision request (`710:109`).
 *
 * ## What it sends, and what it structurally cannot
 *
 * The exact `versionId` the customer was shown and their own words. Nothing
 * else: `RequestDesignRevisionBody` publishes no `documentHash` and no
 * `acceptedAgreements`, this component receives neither, and the consent state
 * is not reachable from here. Asking for a change commits nothing, so it
 * requires no step-up — the dialog says so, because a customer who has just
 * been asked to re-verify for an approval will reasonably expect the same here.
 *
 * ## Validation, and why it is stated rather than merely enforced
 *
 * Empty and whitespace-only feedback is refused before a request is made: the
 * wire accepts one character, and "  " tells the workshop that something is
 * wrong and nothing about what. The 2000-character ceiling is the server's own,
 * enforced here as a `maxLength` *and* re-checked on submit, with a live
 * counter so the limit is visible before it is hit rather than reported after.
 *
 * The text is preserved exactly as typed, apart from the trim the server also
 * applies. It is never parsed, never interpreted as markup and never turned
 * into a status: it is the customer's sentence, stored as their own words.
 *
 * ## The typed text stays here
 *
 * It lives in this component's state for as long as the dialog is open and goes
 * nowhere else — no draft in storage, no query cache, no URL. A dismissed form
 * is a discarded one.
 */
export interface RevisionFormDialogProps {
  readonly versionId: string;
  readonly submitting: boolean;
  readonly onSubmit: (versionId: string, feedback: string) => void;
  readonly onCancel: () => void;
}

export function RevisionFormDialog({
  versionId,
  submitting,
  onSubmit,
  onCancel,
}: RevisionFormDialogProps) {
  const fieldId = useId();
  const errorId = useId();
  const counterId = useId();
  const [feedback, setFeedback] = useState('');
  const [touched, setTouched] = useState(false);

  const problem = revisionFeedbackProblem(feedback);
  const showProblem = touched && problem !== undefined;

  return (
    <ReviewDialog title={COPY.revision.title} onDismiss={onCancel}>
      <p className="secure-design-review__dialog-body">{COPY.revision.body}</p>
      <p className="secure-design-review__dialog-note">{COPY.revision.noStepUp}</p>

      {/*
        `noValidate` so this form has **one** validation authority.

        The textarea keeps `required`, because it genuinely is and assistive
        technology must be told so. But native constraint validation would
        swallow the submit event and answer with a browser bubble — untranslated,
        unstyled, invisible to a screen reader on some platforms, and saying
        something other than the approved copy. Worse, it would silently skip
        the trim: `"   "` satisfies `required` and is exactly the feedback §18
        refuses. So the browser is asked not to adjudicate, and
        `revisionFeedbackProblem` — the same rule the model suite asserts — is
        the only thing that decides.
      */}
      <form
        className="secure-design-review__revision-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (problem !== undefined || submitting) return;
          onSubmit(versionId, feedback);
        }}
      >
        <label className="secure-design-review__revision-label" htmlFor={fieldId}>
          {COPY.revision.label}
        </label>
        <textarea
          id={fieldId}
          className="secure-design-review__revision-input"
          value={feedback}
          rows={5}
          maxLength={REVISION_FEEDBACK_MAX}
          placeholder={COPY.revision.placeholder}
          required
          aria-invalid={showProblem}
          aria-describedby={showProblem ? `${errorId} ${counterId}` : counterId}
          data-testid="design-review-revision-feedback"
          onChange={(event) => {
            setFeedback(event.target.value);
          }}
          onBlur={() => {
            setTouched(true);
          }}
        />

        <p className="secure-design-review__revision-counter" id={counterId}>
          {COPY.revision.counter(feedback.trim().length, REVISION_FEEDBACK_MAX)}
        </p>

        {showProblem ? (
          <p className="secure-design-review__revision-error" id={errorId} role="status">
            {problem === 'REQUIRED'
              ? COPY.revision.required
              : COPY.revision.tooLong(REVISION_FEEDBACK_MAX)}
          </p>
        ) : null}

        <div className="secure-design-review__dialog-actions">
          <button
            type="submit"
            className="secure-design-review__button secure-design-review__button--primary"
            disabled={submitting}
            data-testid="design-review-revision-submit"
          >
            {submitting ? COPY.revision.submitting : COPY.revision.submit}
          </button>
          <button
            type="button"
            className="secure-design-review__button"
            disabled={submitting}
            onClick={onCancel}
          >
            {COPY.revision.cancel}
          </button>
        </div>
      </form>
    </ReviewDialog>
  );
}

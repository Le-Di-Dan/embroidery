'use client';

/**
 * The Session resume state (`APP3-S10`, `610:159`).
 *
 * ## Why the customer is asked rather than sent straight in
 *
 * A stored handle says a Session was opened on this placement in this browser.
 * It does not say the customer wants to be back inside it — they may have come
 * to start something else, and dropping them into a half-finished design they
 * did not ask for is both surprising and, once they start editing, destructive.
 * So the approved state asks, and neither answer is taken for them.
 *
 * `Bắt đầu lại` forgets the handle and returns to the ordinary `APP3-S01` start
 * path. It does **not** open a Session: the accepted flow has the customer
 * choose Blank or a Template, and creating one here would spend a Session from
 * the `IMP-D043` hourly allowance on a choice nobody made.
 *
 * The old Session is not deleted either — there is no such operation, and there
 * should not be. It simply stops being offered here and expires on the server's
 * own schedule.
 */
import { STUDIO_SAVE_COPY } from '../model/studio-autosave-copy';

export interface StudioResumePromptProps {
  readonly isResuming: boolean;
  readonly hasFailed: boolean;
  readonly onContinue: () => void;
  readonly onRestart: () => void;
}

export function StudioResumePrompt({
  isResuming,
  hasFailed,
  onContinue,
  onRestart,
}: StudioResumePromptProps) {
  return (
    <section
      className="studio-resume"
      aria-labelledby="studio-resume-heading"
      data-testid="studio-resume-prompt"
    >
      <h2 className="studio-resume__heading" id="studio-resume-heading">
        {STUDIO_SAVE_COPY.resumeHeading}
      </h2>
      <p className="studio-resume__body">{STUDIO_SAVE_COPY.resumeBody}</p>

      {/*
        A resume that failed for a reason other than expiry — the API was
        unreachable, or answered 5xx. The offer stays: the Session may well still
        be there, and forgetting the handle on a transient failure would discard
        a real design over a dropped request.
      */}
      {hasFailed ? (
        <p className="studio-resume__status" data-testid="studio-resume-failed" role="status">
          {STUDIO_SAVE_COPY.resumeFailed}
        </p>
      ) : null}

      <div className="studio-resume__actions">
        <button
          className="studio-button studio-button--primary"
          data-testid="studio-resume-continue"
          disabled={isResuming}
          onClick={onContinue}
          type="button"
        >
          {isResuming ? STUDIO_SAVE_COPY.resuming : STUDIO_SAVE_COPY.resumeContinue}
        </button>
        <button
          className="studio-button"
          data-testid="studio-resume-restart"
          disabled={isResuming}
          onClick={onRestart}
          type="button"
        >
          {STUDIO_SAVE_COPY.resumeRestart}
        </button>
      </div>
    </section>
  );
}

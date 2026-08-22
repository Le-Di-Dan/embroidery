'use client';

/**
 * The one banner shape the review card uses for every notice (`707:20`).
 *
 * A tone plus a title plus a body, and the tone is carried by a modifier class
 * *and* by the title text — never by colour alone. The approved frames state
 * their meaning in words, and a customer who cannot distinguish the two shades
 * of the palette must still be able to tell "we could not send this" from
 * "these terms changed".
 *
 * `role="status"` rather than `role="alert"`: every one of these appears in
 * response to something the customer just did, and an assertive live region
 * would interrupt a screen reader mid-sentence to say what the customer is
 * already waiting to hear.
 */
export type AlertTone = 'INFO' | 'WARNING' | 'ERROR';

export interface ReviewAlertProps {
  readonly tone: AlertTone;
  readonly title: string;
  readonly body: string;
}

export function ReviewAlert({ tone, title, body }: ReviewAlertProps) {
  return (
    <div
      className={`secure-design-review__alert secure-design-review__alert--${tone.toLowerCase()}`}
      role="status"
      data-testid="design-review-alert"
      data-tone={tone}
    >
      <p className="secure-design-review__alert-title">{title}</p>
      <p className="secure-design-review__alert-body">{body}</p>
    </div>
  );
}

'use client';

/**
 * The alert block the approved frames draw above the card body.
 *
 * One component, four tones, because the frames differ only in border colour and
 * title colour — `Alert info` (`625:77`), `Alert warn` (`625:113`, `625:180`),
 * `Alert error` (`625:147`, `625:218`) and `Alert success` (`625:200`) share the
 * same box, padding, radius and two-line structure.
 *
 * Every alert carries a **title and a body**, never colour alone: `634:150`
 * requires a state to be readable without perceiving the hue.
 */
export type AlertTone = 'info' | 'warn' | 'error' | 'success';

interface VerificationAlertProps {
  readonly tone: AlertTone;
  readonly title: string;
  readonly body: string;
  /**
   * `polite` for outcomes that appear after an action the customer took, so a
   * screen reader announces them without interrupting (`634:145`, `634:146`).
   */
  readonly live?: boolean;
}

export function VerificationAlert({ tone, title, body, live = true }: VerificationAlertProps) {
  return (
    <div
      className={`contact-verification__alert contact-verification__alert--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      {...(live ? { 'aria-live': tone === 'error' ? 'assertive' : 'polite' } : {})}
    >
      <p className="contact-verification__alert-title">{title}</p>
      <p className="contact-verification__alert-body">{body}</p>
    </div>
  );
}

/**
 * The banner above the figures (`702:124` stale, `702:188` expired, and the
 * classified decision refusals).
 *
 * One component for all of them: they are the same shape — a tone, a title and
 * one sentence explaining what did or did not happen — and differ only in which
 * of those they carry. The title is always printed, so the state is never
 * signalled by colour alone (`634:150`).
 *
 * `role="status"` rather than `role="alert"`: every one of these appears as the
 * result of something the customer just did, so it is announced politely at the
 * next opportunity instead of interrupting whatever is being read.
 */
export type AlertTone = 'WARNING' | 'ERROR' | 'INFO';

interface QuotationAlertProps {
  readonly tone: AlertTone;
  readonly title: string;
  readonly body: string;
}

export function QuotationAlert({ tone, title, body }: QuotationAlertProps) {
  return (
    <div
      className={`secure-quotation__alert secure-quotation__alert--${tone.toLowerCase()}`}
      role="status"
    >
      <p className="secure-quotation__alert-title">{title}</p>
      <p className="secure-quotation__alert-body">{body}</p>
    </div>
  );
}

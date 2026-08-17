import type { StatusPresentation } from '../model/custom-request-presentation';

interface CustomRequestStatusBadgeProps {
  readonly status: StatusPresentation;
}

/**
 * The lifecycle state of one request (`662:3`).
 *
 * The label is always rendered as text; the tint the stylesheet adds is a
 * redundant cue, never the message. An operator who cannot distinguish the
 * badge colours still reads "Cần làm rõ".
 *
 * The presentation is computed in the model, so this component cannot decide
 * that an unmapped state is one of the three triage states — it renders what it
 * was handed. `data-status` carries the stored token for tests and for
 * styling, and is `UNKNOWN` exactly when the contract did not define the value.
 */
export function CustomRequestStatusBadge({ status }: CustomRequestStatusBadgeProps) {
  const modifier = status.known ? status.token.toLowerCase().replace(/_/g, '-') : 'unknown';

  return (
    <span
      className={`custom-request-status custom-request-status--${modifier}`}
      data-status={status.token}
    >
      {status.label}
    </span>
  );
}

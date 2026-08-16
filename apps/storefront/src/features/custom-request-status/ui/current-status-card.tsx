import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../model/custom-request-status-copy';
import type { StatusPresentation } from '../model/status-presentation';

/**
 * The aside status card (`661:50` … `661:54`).
 *
 * The badge repeats the state the headline already carries, which is the design
 * being deliberate rather than redundant: the headline badge is scanned, this
 * one is read, and the sentence under it is the only place the state is
 * explained in the customer's own terms.
 *
 * Never colour alone (`634:150`) — the badge prints its label, and the prose
 * below says the same thing again.
 */
export function CurrentStatusCard({ presentation }: { presentation: StatusPresentation }) {
  return (
    <section className="request-status__card" aria-labelledby="request-current-status-title">
      <h2 className="request-status__card-title" id="request-current-status-title">
        {COPY.currentStatus.title}
      </h2>
      <p
        className={`request-status__badge request-status__badge--${presentation.tone.toLowerCase()}`}
      >
        {presentation.badge}
      </p>
      <p className="request-status__card-lead">{presentation.description}</p>
    </section>
  );
}

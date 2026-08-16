import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../model/custom-request-status-copy';

/**
 * What the customer should do, per state (`661:55` … `661:58`).
 *
 * Every entry is a sentence, never a control. In the two states where there is
 * genuinely something to do — a rejected or cancelled request may be replaced —
 * the copy says the customer *may submit a new request*, and stops there: the
 * new request starts at the beginning, with contact verification, and there is
 * no shortcut from here that could skip it (`G01`).
 *
 * `NEEDS_CLARIFICATION` is the state this card exists to get right. The
 * workshop has asked a question, and the honest instruction is "answer where
 * they asked you" — because APP5 has no reply box, no re-upload and no
 * resubmit, and offering one would be inventing a surface the phase does not
 * have (§14).
 */
export function NextStepsCard({ steps }: { steps: readonly string[] }) {
  return (
    <section className="request-status__card" aria-labelledby="request-next-steps-title">
      <h2 className="request-status__card-title" id="request-next-steps-title">
        {COPY.nextSteps.title}
      </h2>
      <ul className="request-status__points">
        {steps.map((step) => (
          <li className="request-status__point" key={step}>
            {step}
          </li>
        ))}
      </ul>
    </section>
  );
}

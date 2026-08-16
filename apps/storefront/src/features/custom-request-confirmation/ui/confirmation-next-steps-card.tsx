import { CUSTOM_REQUEST_CONFIRMATION_COPY as COPY } from '../model/custom-request-confirmation-copy';

/**
 * What happens next (`660:21` … `660:26`).
 *
 * Three ordered steps and one closing sentence. The steps describe what the
 * *workshop* does, not what the customer must do, because at this point there
 * is nothing for the customer to do — the second step is the only one that ever
 * involves them, and it points at the status page rather than at a form here.
 *
 * The closing note is the guard: received is not approved, not quoted and not
 * ordered. It is repeated on the status page for the same reason.
 */
export function ConfirmationNextStepsCard() {
  return (
    <section className="request-confirmation__card" aria-labelledby="confirmation-next-title">
      <h2 className="request-confirmation__card-title" id="confirmation-next-title">
        {COPY.nextSteps.title}
      </h2>
      <ol className="request-confirmation__steps">
        {COPY.nextSteps.steps.map((step) => (
          <li className="request-confirmation__step" key={step}>
            {step}
          </li>
        ))}
      </ol>
      <p className="request-confirmation__note">{COPY.nextSteps.note}</p>
    </section>
  );
}

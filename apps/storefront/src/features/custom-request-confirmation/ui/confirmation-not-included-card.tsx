import { CUSTOM_REQUEST_CONFIRMATION_COPY as COPY } from '../model/custom-request-confirmation-copy';

/**
 * What this step is not (`660:44` … `660:49`).
 *
 * Four absences, named. A confirmation page is the moment a customer is most
 * likely to assume more has happened than has — that a price exists, that the
 * design is agreed, that money is owed or that an order is in production — and
 * the design answers that by listing what is genuinely still ahead instead of
 * staying silent and letting the assumption stand.
 *
 * It is also the boundary marker for this phase. Every line here is an APP6+
 * concern; if one of them ever appears on this page, this card is the sentence
 * it contradicts.
 */
export function ConfirmationNotIncludedCard() {
  return (
    <section className="request-confirmation__card" aria-labelledby="confirmation-excluded-title">
      <h2 className="request-confirmation__card-title" id="confirmation-excluded-title">
        {COPY.notIncluded.title}
      </h2>
      <ul className="request-confirmation__points">
        {COPY.notIncluded.points.map((point) => (
          <li className="request-confirmation__point" key={point}>
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}

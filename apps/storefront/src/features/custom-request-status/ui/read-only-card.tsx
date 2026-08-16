import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../model/custom-request-status-copy';

/**
 * The card whose entire content is what this page does not do (`661:59`).
 *
 * Identical in every approved state, and that is the point. `G01-D06` gives
 * APP5 no customer-initiated cancellation; the submission is frozen at intake
 * and cannot be edited or re-uploaded; quotation, design approval and payment
 * belong to APP6 and later. Stating all three is kinder than leaving a customer
 * to hunt for a button that is not there, and it is also the check on this
 * feature: a control added later would contradict a sentence already on screen.
 */
export function ReadOnlyCard() {
  return (
    <section className="request-status__card" aria-labelledby="request-read-only-title">
      <h2 className="request-status__card-title" id="request-read-only-title">
        {COPY.readOnly.title}
      </h2>
      <ul className="request-status__points">
        {COPY.readOnly.points.map((point) => (
          <li className="request-status__point" key={point}>
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}

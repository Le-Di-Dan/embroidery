'use client';

import Link from 'next/link';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';

interface AcceptedOutcomeProps {
  readonly requestDetailHref: string;
}

/**
 * The accepted outcome (`689:162`).
 *
 * ### What it does not claim
 *
 * No payment has been collected, no Order exists and no inventory is reserved.
 * APP6 stops before all three, so a banner asserting any of them would describe
 * a state no delivered code produces. The customer accepted a price; that is the
 * whole fact.
 *
 * ### Why there is no re-quote control
 *
 * `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` records the accepted position:
 * `APP6-B03` refuses a re-quote after acceptance, and no
 * `QUOTE_ACCEPTED → QUOTED` reopen edge exists. A control here would be an
 * action the API cannot perform, so the screen offers none rather than offering
 * one that fails.
 *
 * ### Why the next step is a link and not a button
 *
 * The `DIGITIZING` transition belongs to `APP6-B06`'s moderation surface on the
 * request detail screen. Duplicating that control here would put a second
 * trigger on one lifecycle move, in a screen that owns neither the guard nor the
 * dialog. The operator is pointed at the surface that owns it.
 */
export function QuotationAcceptedOutcome({ requestDetailHref }: AcceptedOutcomeProps) {
  return (
    <section className="request-quotation__accepted" data-testid="quotation-accepted" role="status">
      <h2 className="request-quotation__section-heading">{COPY.accepted.heading}</h2>
      <p>{COPY.accepted.body}</p>

      <h3 className="request-quotation__subheading">{COPY.accepted.nextStepHeading}</h3>
      <p>{COPY.accepted.nextStepBody}</p>
      <Link className="request-quotation__link" href={requestDetailHref}>
        {COPY.accepted.nextStepLink}
      </Link>
    </section>
  );
}

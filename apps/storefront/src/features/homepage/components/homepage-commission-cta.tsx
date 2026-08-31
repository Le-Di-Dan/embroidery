import Link from 'next/link';

import { HOMEPAGE_COPY } from '../model/homepage-copy';
import { HOMEPAGE_COMMISSION_ROUTE } from '../model/homepage-routes';

/**
 * Section 6 — Commission CTA. Last on the page on purpose: the ask comes after
 * appreciation, never in the feed (`USER_FLOW_ARCHITECTURE` §6.3).
 *
 * The three steps are the *safety evidence* that section also calls for, placed
 * inline so the visitor does not have to go looking for it before pressing the
 * button. Each is quoted from canonical rules rather than reassuring prose:
 * approval precedes payment and the deposit is 40% of the accepted total
 * (`docs/04-BUSINESS-RULES.md` BR-005). No delivery time, price range or
 * guarantee is stated, because none is canonical.
 *
 * The button is a real `<a>` to the **existing** `/yeu-cau/moi` flow (`APP5-S01`)
 * via the shell's constant. No `/cart`, no `/checkout`, no second intake form.
 */
export function HomepageCommissionCta() {
  return (
    <section className="homepage-commission" aria-labelledby="homepage-commission-heading">
      <h2 className="homepage-section__heading" id="homepage-commission-heading">
        {HOMEPAGE_COPY.commission.heading}
      </h2>
      <p className="homepage-commission__lead">{HOMEPAGE_COPY.commission.lead}</p>
      <ol className="homepage-commission__steps" aria-label={HOMEPAGE_COPY.commission.stepsLabel}>
        {HOMEPAGE_COPY.commission.steps.map((step) => (
          <li className="homepage-commission__step" key={step.id}>
            <h3 className="homepage-commission__step-title">{step.title}</h3>
            <p className="homepage-commission__step-body">{step.body}</p>
          </li>
        ))}
      </ol>
      <Link className="homepage-action homepage-action--primary" href={HOMEPAGE_COMMISSION_ROUTE}>
        {HOMEPAGE_COPY.commission.action}
      </Link>
    </section>
  );
}

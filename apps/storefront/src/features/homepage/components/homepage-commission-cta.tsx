import Link from 'next/link';

import { isCustomerRouteWithheld } from '../../release-isolation';
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
 *
 * ## The whole section stands down while Wave 2 is withheld (`APP12-G02-C1`)
 *
 * This section is the ask. Its heading names it, its three steps exist to make
 * the ask safe to accept, and its button is the only thing it asks the visitor
 * to do — so when `/yeu-cau/moi` is a deliberate `404`, dropping the anchor and
 * keeping the rest would leave a section that explains how to commission an
 * embroidery and then offers no way to. That is not the smaller change; it is
 * the same dead end with the exit removed. The section is therefore omitted
 * whole, which is `APP12-G02-C1` §7's `A` — *omit the action* — applied at the
 * boundary the action actually has.
 *
 * Nothing is invented in its place. There is no `Sắp ra mắt`, no banner and no
 * substitute card: `APP12-RELEASE-WAVE-AUTHORITY.md` §7 forbids designing a
 * disabled state for a capability that is not released, and a Homepage that
 * announces the roadmap publishes it. From outside, Wave 2 is simply not there.
 *
 * Not a redesign, and not a deletion: the copy, the steps and the href are
 * unchanged in source, the remaining five sections keep their locked order, and
 * releasing the capability restores this section exactly as delivered.
 */
export function HomepageCommissionCta() {
  if (isCustomerRouteWithheld(HOMEPAGE_COMMISSION_ROUTE)) {
    return null;
  }

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

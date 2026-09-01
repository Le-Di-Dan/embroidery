import Link from 'next/link';

import { isCustomerRouteWithheld } from '../../release-isolation';
import { STOREFRONT_DISCOVER_ROUTE } from '../../storefront-shell';
import { HOMEPAGE_COPY } from '../model/homepage-copy';
import { HOMEPAGE_COMMISSION_ROUTE } from '../model/homepage-routes';

/**
 * Section 1 — Hero. The store introduction, and the page's only `<h1>`.
 *
 * Brief by design (`DESIGN_VISION` §8: the hero introduces, the works are the
 * page). No carousel and no promotional banner, both explicitly rejected there.
 *
 * Two real links, not one. `USER_FLOW_ARCHITECTURE` §6.3 is explicit that the
 * primary ask is never presented in isolation, so the low-commitment move
 * (Khám phá) is co-present and comes first in both source and reading order.
 * The heading and lead are DOM text — the store introduction is never carried
 * by an image alone.
 *
 * The second of the two is the commission ask, and `APP12-G02-C1` drops it
 * while Wave 2 is withheld: `/yeu-cau/moi` is a deliberate `404` then, and the
 * page's opening section must not offer an address the server refuses. §6.3's
 * constraint survives that removal intact — it requires the primary ask never
 * to stand alone, not that a second action always exist — so what is left is a
 * hero whose one action is the low-commitment move it always led with. The
 * heading, the lead and the explore link are untouched, and the ask returns
 * unchanged the moment the capability is released.
 */
export function HomepageHero() {
  const commissionWithheld = isCustomerRouteWithheld(HOMEPAGE_COMMISSION_ROUTE);

  return (
    <section className="homepage-hero" aria-labelledby="homepage-hero-heading">
      <h1 className="homepage-hero__heading" id="homepage-hero-heading">
        {HOMEPAGE_COPY.hero.heading}
      </h1>
      <p className="homepage-hero__lead">{HOMEPAGE_COPY.hero.lead}</p>
      <div className="homepage-hero__actions">
        <Link className="homepage-action homepage-action--primary" href={STOREFRONT_DISCOVER_ROUTE}>
          {HOMEPAGE_COPY.hero.exploreAction}
        </Link>
        {commissionWithheld ? null : (
          <Link className="homepage-action homepage-action--quiet" href={HOMEPAGE_COMMISSION_ROUTE}>
            {HOMEPAGE_COPY.hero.commissionAction}
          </Link>
        )}
      </div>
    </section>
  );
}

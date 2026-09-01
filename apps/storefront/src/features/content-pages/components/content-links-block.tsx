import Link from 'next/link';

import { isCustomerRouteWithheld } from '../../release-isolation';
import type { ContentLinksSection } from '../model/content-page';

/**
 * The template's `[REQUIRED]` related internal-navigation block (`863:677`).
 *
 * Every `href` reaching this component was composed from a shell route constant
 * or `buildStorefrontPolicyPath` in a page definition, so a content page cannot
 * link to a route that does not exist — the dead-anchor discipline the Homepage
 * route model states, applied to the Storefront's second-densest set of
 * outbound links.
 *
 * Link text is descriptive on its own (`docs/08` §4). No "xem thêm", no "tại
 * đây": each anchor names its destination, so a screen-reader user listing the
 * page's links hears five distinct destinations rather than five identical ones.
 * The optional hint sits outside the anchor — inside it, it would be swallowed
 * into the accessible name and make every link announce a full sentence.
 *
 * ## A withheld destination is dropped, not disabled (`APP12-G02-C1`)
 *
 * Five of the S05 definitions list `Gửi yêu cầu thêu` → `/yeu-cau/moi` among
 * their related links. While the Wave-2 custom embroidery capability is
 * withheld, `src/proxy.ts` answers that address with a real `404`, so offering
 * it here would be a deliberate dead end. The item is omitted from the list
 * rather than rendered as inert text: this block is a list of *places to go
 * next*, every remaining entry of which still goes somewhere, and a disabled
 * row in it would name a destination and then refuse it. Each of the five
 * lists keeps four or more links, so none of them empties.
 *
 * The page **definitions** are untouched, so the link returns byte-identically
 * the moment the capability is released. The model still holds the authority
 * for what a page links to; this is only what may be offered right now.
 */
export function ContentLinksBlock({ section }: { section: ContentLinksSection }) {
  const headingId = `content-${section.id}-heading`;
  const links = section.links.filter((link) => !isCustomerRouteWithheld(link.href));

  // A heading over an empty list would be a block about nothing. No definition
  // produces this today; it is here so that one that did could not ship one.
  if (links.length === 0) {
    return null;
  }

  return (
    <section className="content-page__block content-page__links" aria-labelledby={headingId}>
      <h2 className="content-page__block-heading" id={headingId}>
        {section.heading}
      </h2>
      <ul className="content-page__link-list">
        {links.map((link) => (
          <li className="content-page__link-item" key={link.id}>
            <Link className="content-page__link" href={link.href}>
              {link.label}
            </Link>
            {link.hint === undefined ? null : (
              <p className="content-page__link-hint">{link.hint}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from 'next/link';

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
 */
export function ContentLinksBlock({ section }: { section: ContentLinksSection }) {
  const headingId = `content-${section.id}-heading`;

  return (
    <section className="content-page__block content-page__links" aria-labelledby={headingId}>
      <h2 className="content-page__block-heading" id={headingId}>
        {section.heading}
      </h2>
      <ul className="content-page__link-list">
        {section.links.map((link) => (
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

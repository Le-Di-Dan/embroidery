import Link from 'next/link';

import { STOREFRONT_DISCOVER_ROUTE } from '../../storefront-shell';
import { HOMEPAGE_COPY } from '../model/homepage-copy';
import type { HomepageWorks } from '../model/homepage-works';
import { HomepageWorkCard } from './homepage-work-card';

/**
 * Sections 2 and 3 — Featured Works and the Discover Feed preview.
 *
 * They are one component because they are one read: both slices come from the
 * single bounded catalog request, so a shared `empty`/`error` outcome must be
 * rendered consistently in both rather than resolved twice. Section order is
 * unaffected — they are adjacent in the locked sequence.
 *
 * Both headings render whatever the catalog says. On `empty` or `error` the
 * sections stay present and state the truth in one approved line; they never
 * surface a status code, an API message or a request id, and they never remove
 * themselves, because a section that vanishes on failure teaches the visitor
 * nothing. There is no load-more and no infinite scroll here: continuation is
 * `/kham-pha`'s job, and the link to it is the continuation.
 */
export function HomepageWorksSections({ works }: { works: HomepageWorks }) {
  const notice = works.status === 'ready' ? undefined : HOMEPAGE_COPY.works[works.status];

  return (
    <>
      <section className="homepage-section" aria-labelledby="homepage-featured-heading">
        <div className="homepage-section__head">
          <h2 className="homepage-section__heading" id="homepage-featured-heading">
            {HOMEPAGE_COPY.featured.heading}
          </h2>
          <p className="homepage-section__intro">{HOMEPAGE_COPY.featured.intro}</p>
        </div>
        {works.status === 'ready' ? (
          <>
            <ul className="homepage-works homepage-works--featured">
              {works.featured.map((card) => (
                <li key={card.slug}>
                  <HomepageWorkCard card={card} />
                </li>
              ))}
            </ul>
            <Link
              className="homepage-action homepage-action--link"
              href={STOREFRONT_DISCOVER_ROUTE}
            >
              {HOMEPAGE_COPY.featured.action}
            </Link>
          </>
        ) : (
          <p className="homepage-section__notice">{notice}</p>
        )}
      </section>

      <section className="homepage-section" aria-labelledby="homepage-discover-heading">
        <div className="homepage-section__head">
          <h2 className="homepage-section__heading" id="homepage-discover-heading">
            {HOMEPAGE_COPY.discover.heading}
          </h2>
          <p className="homepage-section__intro">{HOMEPAGE_COPY.discover.intro}</p>
        </div>
        {works.status === 'ready' && works.preview.length > 0 ? (
          <ul className="homepage-works homepage-works--preview">
            {works.preview.map((card) => (
              <li key={card.slug}>
                <HomepageWorkCard card={card} />
              </li>
            ))}
          </ul>
        ) : null}
        <Link className="homepage-action homepage-action--link" href={STOREFRONT_DISCOVER_ROUTE}>
          {HOMEPAGE_COPY.discover.action}
        </Link>
      </section>
    </>
  );
}

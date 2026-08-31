import Link from 'next/link';

import { HOMEPAGE_COPY } from '../model/homepage-copy';
import { HOMEPAGE_GALLERY_ROUTE } from '../model/homepage-routes';

/**
 * Section 4 — Collections.
 *
 * The approved Homepage draws this section continuing into the public gallery
 * feed. `APP11-S01` shipped it without that action because `/bo-suu-tap` did not
 * exist and the alternatives were all worse than a reduced section: hard-coded
 * gallery slugs (a link to a 404), invented gallery entries (fabricated content
 * presented as the studio's work), a call to `publicGalleryEntry_list` (starting
 * S02's capability inside S01), or a disabled-looking anchor (a dead anchor
 * wearing a costume).
 *
 * `APP11-S02` built the route, so the staged action is now real. Nothing else
 * about the section changed: the same heading and the same editorial framing,
 * plus the one anchor the design always drew. The path is read from the shell's
 * canonical constant, so this link and the header's `Bộ sưu tập` item cannot
 * disagree about the address, and it reuses the Homepage's existing continuation
 * link treatment rather than introducing a fifth action style for one anchor.
 *
 * There is still no "coming soon" line, no card grid and no gallery read here.
 * The section points at the feed; the feed does its own listing.
 */
export function HomepageCollections() {
  return (
    <section className="homepage-section" aria-labelledby="homepage-collections-heading">
      <div className="homepage-section__head">
        <h2 className="homepage-section__heading" id="homepage-collections-heading">
          {HOMEPAGE_COPY.collections.heading}
        </h2>
        <p className="homepage-section__intro homepage-section__intro--wide">
          {HOMEPAGE_COPY.collections.intro}
        </p>
        <Link className="homepage-action homepage-action--link" href={HOMEPAGE_GALLERY_ROUTE}>
          {HOMEPAGE_COPY.collections.action}
        </Link>
      </div>
    </section>
  );
}

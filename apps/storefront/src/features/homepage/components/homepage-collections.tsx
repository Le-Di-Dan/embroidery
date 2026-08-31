import { HOMEPAGE_COPY } from '../model/homepage-copy';

/**
 * Section 4 — Collections.
 *
 * The approved Homepage draws this section with cards that link into the public
 * gallery feed. That feed is `APP11-S02`'s route (`/bo-suu-tap`), and it does
 * not exist yet, so this checkpoint ships the section's heading and editorial
 * framing and **nothing that navigates** (`APP11-S01` §12).
 *
 * What is deliberately absent, and why each would have been worse than a
 * reduced section: hard-coded gallery slugs (a link to a 404), invented gallery
 * entries (fabricated content presented as the studio's work), a call to
 * `publicGalleryEntry_list` (starting S02's capability inside S01), and a
 * disabled-looking anchor to `/bo-suu-tap` (a dead anchor wearing a costume).
 *
 * There is also no "coming soon" line. The section states what the collections
 * *are* — which is true today and stays true after S02 — instead of narrating
 * the delivery schedule to a visitor who has no use for it. The header nav
 * already carries the shell's own truthful affordance for the unbuilt area.
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
      </div>
    </section>
  );
}

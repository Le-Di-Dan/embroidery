import { HOMEPAGE_COPY } from '../model/homepage-copy';
import { HOMEPAGE_FEATURED_COUNT, HOMEPAGE_PREVIEW_COUNT } from '../model/homepage-works';

/**
 * The bounded skeleton shown while the single catalog read is in flight
 * (`APP11-S01` §14).
 *
 * Bounded in the literal sense: it draws exactly as many placeholders as the
 * sections can hold, so the page cannot reflow to a different height when the
 * real cards arrive, and it can never grow.
 *
 * The placeholders are `aria-hidden`; one polite live region carries the state
 * in words. Announcing nine empty boxes would be noise, and announcing nothing
 * would leave a screen-reader user with silence where the page's main content is
 * about to appear.
 */
export function HomepageWorksSkeleton() {
  const placeholders = HOMEPAGE_FEATURED_COUNT + HOMEPAGE_PREVIEW_COUNT;
  return (
    <section className="homepage-section" aria-labelledby="homepage-works-loading-heading">
      <h2 className="homepage-section__heading" id="homepage-works-loading-heading">
        {HOMEPAGE_COPY.featured.heading}
      </h2>
      <p className="homepage-section__notice" role="status">
        {HOMEPAGE_COPY.works.loading}
      </p>
      <ul aria-hidden="true" className="homepage-works homepage-works--skeleton">
        {Array.from({ length: placeholders }, (_, index) => (
          <li className="homepage-works__placeholder" key={index} />
        ))}
      </ul>
    </section>
  );
}

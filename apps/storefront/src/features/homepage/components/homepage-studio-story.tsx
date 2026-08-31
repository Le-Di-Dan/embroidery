import { HOMEPAGE_COPY } from '../model/homepage-copy';

/**
 * Section 5 — Studio Story.
 *
 * `USER_FLOW_ARCHITECTURE` §6.2 rates this the largest single trust movement on
 * the site, and it earns that only if it is honest. The copy therefore describes
 * the studio's *process* — which is canonical, in
 * `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` and BR-005 — and claims no operational
 * fact the repository cannot source: no founding year, no headcount, no order or
 * customer count, no capacity and no certification.
 *
 * Plain prose at a reading measure, no imagery: the text is the content, so it
 * lives in the DOM rather than inside a picture of itself.
 */
export function HomepageStudioStory() {
  return (
    <section className="homepage-story" aria-labelledby="homepage-story-heading">
      <h2 className="homepage-section__heading" id="homepage-story-heading">
        {HOMEPAGE_COPY.story.heading}
      </h2>
      <div className="homepage-story__body">
        {HOMEPAGE_COPY.story.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

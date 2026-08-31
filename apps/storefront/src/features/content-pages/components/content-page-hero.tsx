import type { ContentPage } from '../model/content-page';

/**
 * The template's `[REQUIRED]` hero: optional non-linked trail, eyebrow, the
 * page's single `<h1>`, and the lead paragraph (`863:677`).
 *
 * The trail is plain text, never an anchor. Only the policy pages carry one, and
 * their parent `Chính sách` has no `page.tsx` — D01 permits a plain-text
 * hierarchy label precisely so the trail can show where the page sits without
 * `/chinh-sach` having to be invented to stop a crumb being dead. It is marked
 * `aria-hidden` because the same hierarchy is already stated by the eyebrow and
 * the heading; a screen reader gains nothing from `Chính sách /` read aloud as
 * loose text.
 *
 * No `BreadcrumbList` JSON-LD accompanies it, for the reason the gallery feed
 * emits none: structured data describes a trail the page actually presents as
 * navigation, and this one is a label.
 */
export function ContentPageHero({ page }: { page: ContentPage }) {
  return (
    <header className="content-page__hero">
      {page.trail === undefined ? null : (
        <p className="content-page__trail" aria-hidden="true">
          <span className="content-page__trail-parent">{page.trail.parentLabel}</span>
          <span className="content-page__trail-separator">/</span>
          <span className="content-page__trail-current">{page.heading}</span>
        </p>
      )}
      <p className="content-page__eyebrow">{page.eyebrow}</p>
      <h1 className="content-page__title">{page.heading}</h1>
      <p className="content-page__lead">{page.lead}</p>
    </header>
  );
}

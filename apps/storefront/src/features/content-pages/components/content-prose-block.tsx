import type { ContentProseSection } from '../model/content-page';

/**
 * The template's `[REQUIRED]` long-form body block (`863:677`).
 *
 * Real DOM text, never an image of text: `docs/08` §5 requires indexable content
 * outside image assets, and a policy rendered as a picture is unreadable to a
 * screen reader and unquotable by the customer it binds.
 *
 * The heading is `<h2>`. The section's own `id` becomes the DOM id and names the
 * heading through `aria-labelledby`, so each block is a labelled region a screen
 * reader can jump between, and a link to `#journey` lands on the right heading.
 *
 * Reading width is capped by the stylesheet rather than by splitting the copy
 * into columns — D01 caps long-form measure at 736/640/342, and a policy read at
 * full 1440 width is where a customer loses their line.
 */
export function ContentProseBlock({ section }: { section: ContentProseSection }) {
  const headingId = `content-${section.id}-heading`;

  return (
    <section className="content-page__block" aria-labelledby={headingId}>
      <h2 className="content-page__block-heading" id={headingId}>
        {section.heading}
      </h2>
      {section.paragraphs.map((paragraph, index) => (
        <p className="content-page__paragraph" key={`${section.id}-p-${String(index)}`}>
          {paragraph}
        </p>
      ))}
      {section.bullets === undefined ? null : (
        <ul className="content-page__list">
          {section.bullets.map((bullet, index) => (
            <li className="content-page__list-item" key={`${section.id}-li-${String(index)}`}>
              {bullet}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

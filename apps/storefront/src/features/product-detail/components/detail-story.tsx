import { PRODUCT_DETAIL_COPY } from '../model/product-detail-copy';

/**
 * The one description section (IMP-D039, corrected by `APP2-S02-G01-C1`).
 *
 * Exactly one section for exactly one contract field. The UI03 draft split the
 * story into `Cảm hứng` / `Ý tưởng` / `Ý nghĩa`; `publicProductDetail` carries a
 * single optional `description`, so three headings would need two strings nobody
 * ever wrote.
 *
 * The caller omits this component entirely when `description` is absent — an
 * empty heading is worse than no section, because it reads as content the studio
 * forgot to supply.
 *
 * The measure is capped at 640px on desktop and tablet in SCSS (~75 characters,
 * the original UI03 accessibility rule). The first delivery of the design gate
 * claimed that measure while rendering the paragraph across the full 1280px
 * band; the cap now lives with the text it constrains.
 */
export function DetailStory({ description }: { description: string }) {
  return (
    <section className="product-detail__story" aria-labelledby="product-detail-story-heading">
      <h2 className="product-detail__story-heading" id="product-detail-story-heading">
        {PRODUCT_DETAIL_COPY.storyHeading}
      </h2>
      <p className="product-detail__story-body">{description}</p>
    </section>
  );
}

import { GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

/**
 * The one description section.
 *
 * Exactly one section for exactly one contract field.
 * `publicGalleryEntryDetail` carries a single `description`, so splitting it
 * into `Cảm hứng` / `Ý tưởng` / `Ý nghĩa` / `Kỹ thuật` — as the historical UI05
 * draft did — would need three strings nobody ever wrote, and would silently
 * attribute a quarter of one paragraph to each invented heading.
 *
 * The caller omits this component entirely when the description is empty: an
 * empty heading reads as content the studio forgot to supply, which is a worse
 * lie than saying nothing.
 *
 * The measure is capped in SCSS rather than by truncating the text: the
 * paragraph wraps naturally, with no clamp, no fixed height and no "read more"
 * that would hide editorial copy behind a control.
 */
export function GalleryDetailNarrative({ description }: { description: string }) {
  return (
    <section
      className="gallery-detail__narrative"
      aria-labelledby="gallery-detail-narrative-heading"
    >
      <h2 className="gallery-detail__narrative-heading" id="gallery-detail-narrative-heading">
        {GALLERY_DETAIL_COPY.narrativeHeading}
      </h2>
      <p className="gallery-detail__narrative-body">{description}</p>
    </section>
  );
}

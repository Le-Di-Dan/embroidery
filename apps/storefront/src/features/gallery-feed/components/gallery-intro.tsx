import { GALLERY_COPY } from '../model/gallery-copy';

/**
 * The feed's editorial head — the page's single `<h1>` and one lead paragraph.
 *
 * A Server Component: nothing here depends on the query. Keeping it outside the
 * client island means the heading is in the server-rendered HTML even while the
 * feed below is still resolving, so the page never renders headingless.
 *
 * UI05 also draws an eyebrow line above the H1 (`BỘ SƯU TẬP CỦA XƯỞNG ·
 * PROVISIONAL_COPY`). It is omitted: the file marks that string provisional, and
 * an eyebrow that repeats the heading in capitals adds a second announcement of
 * the same words for a screen reader without adding meaning.
 */
export function GalleryIntro() {
  return (
    <div className="gallery-feed__intro">
      <h1 className="gallery-feed__title">{GALLERY_COPY.heading}</h1>
      <p className="gallery-feed__intro-text">{GALLERY_COPY.intro}</p>
    </div>
  );
}

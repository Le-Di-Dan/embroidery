import { GALLERY_COPY } from '../model/gallery-copy';

/**
 * Nothing is published (UI05 `357:3`).
 *
 * One sentence of approved copy and nothing else. No operator instruction, no
 * "create your first entry", no checkpoint note and no commission call to
 * action: an empty gallery is a fact about the workshop's progress, and the
 * visitor reading it is not the person who would fill it.
 *
 * It is a plain statement rather than an alert — nothing failed, and nothing is
 * being asked of the reader.
 */
export function GalleryEmpty() {
  return (
    <div className="gallery-feed__notice">
      <p className="gallery-feed__notice-body">{GALLERY_COPY.empty}</p>
    </div>
  );
}

import type { GalleryDetailView } from '../model/gallery-detail-view';
import { GalleryDetailBreadcrumb } from './gallery-detail-breadcrumb';
import { GalleryDetailCommission } from './gallery-detail-commission';
import { GalleryDetailContinue } from './gallery-detail-continue';
import { GalleryDetailMedia } from './gallery-detail-media';
import { GalleryDetailNarrative } from './gallery-detail-narrative';
import { GalleryDetailRelatedProduct } from './gallery-detail-related-product';

/**
 * The Gallery Entry Detail composition (`860:442` / `861:4321` / `861:4487`).
 *
 * A Server Component. Only the media block and the related-product card are
 * client islands, so the title, the narrative, the first image and every link
 * are in the server-rendered HTML — which is what makes the page indexable and
 * readable before any JavaScript arrives, and what lets it still be understood
 * when the images themselves are unavailable.
 *
 * No `<main>`, no header, no footer and no skip link: the root layout's shell
 * already provides all four, and a second one would duplicate the landmark
 * assistive technology uses to skip straight to content.
 *
 * ## What the approved frames keep, and what APP11 removed
 *
 * Retained from UI05: Breadcrumb, Entry Hero, Entry Narrative, Continue
 * Discovering, Soft Commission CTA — plus the shell's Header and Footer.
 *
 * Added by `APP11-D01`: the ordered entry media block, its lightbox, and the
 * optional Related Product affordance.
 *
 * **Absent, deliberately:**
 *
 * - `Section / Member Works` — removed from all three approved frames.
 *   `NESTED_COLLECTION_WORK_MODEL = false`: an entry has images, not child
 *   works, so there is nothing to list.
 * - `Entry Attributes` — the approved frames retain the block "only when
 *   data-backed", and nothing backs it. `publicGalleryEntryDetail` publishes a
 *   title, a description, images, an optional product link and SEO fields;
 *   there is no year, technique, material, dimension or edition anywhere in
 *   the contract, so every attribute row would be invented.
 * - `Related Entries` — see `GalleryDetailContinue`: no related-gallery
 *   operation exists, and labelling arbitrary feed entries "related" would be
 *   a recommendation nobody made.
 *
 * The H1 is the entry title and is the page's only H1; every other section
 * heading is an H2, which keeps the outline flat and matches the one-H1 rule
 * the approved accessibility board states for this area.
 */
export function GalleryDetailScreen({ entry }: { entry: GalleryDetailView }) {
  return (
    <article className="gallery-detail">
      <GalleryDetailBreadcrumb title={entry.title} />

      <header className="gallery-detail__hero">
        <h1 className="gallery-detail__title">{entry.title}</h1>
      </header>

      <GalleryDetailMedia media={entry.media} title={entry.title} />

      {entry.description === undefined ? null : (
        <GalleryDetailNarrative description={entry.description} />
      )}

      {entry.linkedProduct === null ? null : (
        <GalleryDetailRelatedProduct product={entry.linkedProduct} />
      )}

      <GalleryDetailContinue />
      <GalleryDetailCommission />
    </article>
  );
}

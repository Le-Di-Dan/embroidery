import Link from 'next/link';

import { STOREFRONT_GALLERY_ROUTE } from '../../storefront-shell';
import { GALLERY_DETAIL_COPY } from '../model/gallery-detail-copy';

/**
 * Navigation back into the gallery feed.
 *
 * **Two levels, not three.** `NESTED_COLLECTION_WORK_MODEL = false`: there is
 * no parent collection between the feed and this entry, so the trail is
 * `Bộ sưu tập / <entry title>` and nothing else. The historical UI05 draft's
 * `feed / collection / work` trail was collapsed by `APP11-D01`, and a middle
 * crumb here would have to name a grouping the data model does not have.
 *
 * Desktop and tablet show the trail; mobile shows a single back link, which is
 * the approved composition (`861:4487`) rather than a squeezed trail. Both are
 * rendered and CSS shows one per viewport — `display: none` removes the other
 * from the accessibility tree too, so assistive technology hears exactly one
 * route back, not two.
 *
 * The current entry is text with `aria-current="page"`, not a link: a
 * breadcrumb item pointing at the page you are already on is a dead control
 * that costs a Tab stop.
 *
 * The feed href comes from the shell constant, so this crumb and the header's
 * own `Bộ sưu tập` item can never disagree about where the gallery lives.
 */
export function GalleryDetailBreadcrumb({ title }: { title: string }) {
  return (
    <nav className="gallery-detail__breadcrumb" aria-label={GALLERY_DETAIL_COPY.breadcrumbLabel}>
      <Link className="gallery-detail__back-link" href={STOREFRONT_GALLERY_ROUTE}>
        {GALLERY_DETAIL_COPY.backToGallery}
      </Link>
      <ol className="gallery-detail__crumbs">
        <li className="gallery-detail__crumb">
          <Link href={STOREFRONT_GALLERY_ROUTE}>{GALLERY_DETAIL_COPY.gallery}</Link>
        </li>
        <li className="gallery-detail__crumb" aria-current="page">
          {title}
        </li>
      </ol>
    </nav>
  );
}

import { STOREFRONT_GALLERY_ROUTE } from '../../storefront-shell';

/**
 * The public gallery route (`APP11-D01` registry rows; `APP11-G01-C1`).
 *
 * Re-exported from the shell rather than re-declared, for the reason
 * `discover-route.ts` gives: routes are shell IA — the header's `Bộ sưu tập`
 * item and the Homepage Collections action both target this one — and two
 * literals for one path is how an alias appears by accident. `/thu-vien`,
 * `/gallery` and `/collections` are rejected, and no redirect is approved.
 *
 * There is deliberately **no** entry-path builder here either.
 * `buildStorefrontGalleryDetailPath` landed with `APP11-S03` and lives beside
 * this constant in the shell, for the same reason: the address is shell IA, the
 * feed card and the entry page's own canonical must read one function, and a
 * copy in this file would be a second place for the path to change.
 */
export const GALLERY_ROUTE = STOREFRONT_GALLERY_ROUTE;

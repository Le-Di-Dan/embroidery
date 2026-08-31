/**
 * The Admin gallery routes, in one place.
 *
 * `/gallery` is the address the approved `APP11-D01` package fixes for the
 * gallery list (`866:905`), and the canonical spelling for this phase: there is
 * no `/admin/gallery` alias, no `/collections` and no `/library`.
 *
 * `/gallery/{entryId}` is the editor (`868:909`), delivered by `APP11-A02`.
 * `APP11-A01` deliberately addressed nothing here while the segment did not
 * exist; now that it does, the list's rows and cards link to it and the create
 * bootstrap navigates to it with the id the server returned.
 *
 * The segment is the entry's **UUID**, never its slug. The slug is the public
 * address a customer visits; addressing the Admin editor by it would make an
 * operator's URL depend on a value the entry is free to have been created with
 * and would collide with the storefront's own vocabulary. Publication is a
 * panel *inside* this route, not a route of its own — and there is deliberately
 * no `/gallery/new`: creation is a bootstrap interaction on the list, because
 * the server owns the id the editor is addressed by and there is nothing to
 * edit until it has issued one.
 */
export const ADMIN_GALLERY_ROUTE = '/gallery';

/** The editor address for one entry. Encoded, because it is interpolated. */
export function adminGalleryEntryRoute(entryId: string): string {
  return `${ADMIN_GALLERY_ROUTE}/${encodeURIComponent(entryId)}`;
}

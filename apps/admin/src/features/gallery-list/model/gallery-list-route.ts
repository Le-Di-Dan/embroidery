/**
 * The Admin gallery routes, in one place.
 *
 * `/gallery` is the address the approved `APP11-D01` package fixes for the
 * gallery list (`866:905`), and the canonical spelling for this phase: there is
 * no `/admin/gallery` alias, no `/collections` and no `/library`.
 *
 * The **editor** address is deliberately absent. `APP11-A02` owns
 * `/gallery/{entryId}` and creates the segment behind it; A01 neither builds
 * that route nor addresses it, because a row link to a segment that does not
 * exist is a control that answers a click with a 404. That is the one place
 * this checkpoint departs from the approved end-state frames, and it is staged
 * rather than rejected — `STAGED_ACTION_OWNERSHIP` in the completion report
 * records it, and A02 restores both the create action and the row navigation.
 */
export const ADMIN_GALLERY_ROUTE = '/gallery';

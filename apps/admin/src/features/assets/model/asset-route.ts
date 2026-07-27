/**
 * The single canonical route for the Admin asset library, owned by this
 * capability. The shell navigation and the route segment both read it, so there
 * is exactly one spelling and no `/admin/assets`, `/media` or `/catalog/assets`
 * alias. Neutral module (no `server-only`) — the client navigation imports it.
 */
export const ADMIN_ASSETS_ROUTE = '/assets';

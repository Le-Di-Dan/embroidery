/**
 * The single canonical route for Admin category management (`APP12-A01`).
 *
 * Owned by this capability so the shell navigation and the route segment read
 * one spelling. There is exactly one route: no `/categories/new`, no
 * `/categories/{categoryId}`, no `/catalog/categories` and no `/danh-muc`
 * alias. `FIG-APP12-A04-CATEGORY-LIST-DESKTOP` draws list, form and refusal on
 * one screen, so a second address would be a screen nobody designed.
 *
 * Neutral module (no `server-only`) — the client navigation imports it.
 */
export const ADMIN_CATEGORIES_ROUTE = '/categories';

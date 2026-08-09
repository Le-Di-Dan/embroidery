/**
 * The single canonical route for the Admin Design Template list, owned by this
 * capability. The shell navigation and the route segment both read it, so there
 * is exactly one spelling and no `/admin/design-templates`, `/templates` or
 * `/mau-theu` alias.
 *
 * Neutral module (no `server-only`) — the client navigation imports it.
 *
 * There is deliberately **no** editor route here. `APP3-A03` owns the Template
 * editor, and a constant naming a screen that does not exist is how a list ends
 * up linking into a 404 (CLAUDE.md §16, and the shell's own rule that every nav
 * entry points at a route that exists).
 */
export const ADMIN_DESIGN_TEMPLATES_ROUTE = '/design-templates';

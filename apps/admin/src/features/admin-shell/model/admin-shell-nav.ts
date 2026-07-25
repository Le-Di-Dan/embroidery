/**
 * A primary-navigation entry. APP1-A02 ships no business routes, so the shell
 * renders only the current location as a non-link item (`current: true`).
 * Future phases add real routes here; until then there are no dead anchors
 * (CLAUDE.md §16 — no links to unimplemented routes).
 */
export interface AdminNavItem {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
}

/**
 * The authenticated shell's primary navigation. Only the current location
 * exists in APP1-A02; it is rendered as static text with `aria-current="page"`,
 * never as a link to an unbuilt route.
 */
export const ADMIN_PRIMARY_NAV: readonly AdminNavItem[] = [
  { id: 'overview', label: 'Tổng quan', current: true },
];

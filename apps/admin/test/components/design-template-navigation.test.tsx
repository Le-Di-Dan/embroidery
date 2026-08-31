/**
 * Reaching the Design Template list from the Admin shell (`APP3-A02`).
 *
 * The shell's own rule is that every primary-navigation entry points at a route
 * that exists. This asserts the new entry against the same route constant the
 * segment uses, so a label and a destination cannot drift apart.
 */
import {
  ADMIN_PRIMARY_NAV,
  isCurrentNavItem,
  resolveNavItemState,
} from '../../src/features/admin-shell/model/admin-shell-nav';
import {
  ADMIN_DESIGN_TEMPLATES_ROUTE,
  DESIGN_TEMPLATE_COPY,
} from '../../src/features/design-templates';

const entry = ADMIN_PRIMARY_NAV.find((item) => item.id === 'design-templates');

it('adds one primary navigation entry for the Template list', () => {
  expect(entry).toBeDefined();
  expect(entry?.href).toBe(ADMIN_DESIGN_TEMPLATES_ROUTE);
  // The label comes from the owning capability, so there is one spelling.
  expect(entry?.label).toBe(DESIGN_TEMPLATE_COPY.page.title);
});

it('marks the entry current on its own route', () => {
  expect(isCurrentNavItem(entry!, ADMIN_DESIGN_TEMPLATES_ROUTE)).toBe(true);
});

it('keeps the list reachable from a future nested template route', () => {
  // `APP3-A03` will live beneath this segment; the section must stay a
  // destination rather than becoming unreachable from its own detail screen.
  expect(resolveNavItemState(entry!, `${ADMIN_DESIGN_TEMPLATES_ROUTE}/some-id`)).toBe('section');
});

it('does not disturb the existing entries', () => {
  // Later phases append their own destinations; what this pins is that the
  // Template entry keeps its position among the ones that came before it.
  // (`APP4-A01` and `APP5-A01` each added one after it, and the list was left
  // stale at `APP4-A01` — this assertion was red at `APP5-A01`'s entry HEAD.)
  expect(ADMIN_PRIMARY_NAV.map((item) => item.id)).toEqual([
    'overview',
    'assets',
    'products',
    // `APP11-A01` appended the gallery beside the catalog surfaces.
    'gallery',
    'design-templates',
    'custom-requests',
    // `APP7-A01` appended the order queue after the request queue — the
    // sequence an order actually travels.
    'orders',
    // `APP8-A02` appended the production queue after the order queue, which is
    // where `780:22` draws it.
    'production',
    'customer-access-support',
  ]);
});

/**
 * Reaching the merge workflow from the Admin shell (`APP10-A02`).
 *
 * The claim under test is the one thing A02 could have broken in a delivered
 * screen: the customer-access support entry must stay lit and reachable on both
 * new sub-routes, and APP10 must add **no** navigation entry of its own.
 *
 * `resolveNavItemState` is the shell's existing rule and A02 changes none of it.
 * Asserting against the same route constants the segments use is what keeps a
 * label and a destination from drifting apart.
 */
import {
  ADMIN_PRIMARY_NAV,
  isCurrentNavItem,
  resolveNavItemState,
} from '../../src/features/admin-shell/model/admin-shell-nav';
import { ADMIN_CUSTOMER_ACCESS_ROUTE } from '../../src/features/customer-access-support';
import {
  ADMIN_CUSTOMER_MERGE_ROUTE,
  adminCustomerMergeCaseRoute,
} from '../../src/features/customer-merge';

const entry = ADMIN_PRIMARY_NAV.find((item) => item.id === 'customer-access-support');

it('adds no navigation entry for the merge workflow', () => {
  expect(ADMIN_PRIMARY_NAV.map((item) => item.id)).toEqual([
    'overview',
    'assets',
    'products',
    // `APP12-A01` inserted category management between the catalog surfaces.
    'categories',
    // `APP11-A01` appended the gallery beside the catalog surfaces.
    'gallery',
    'design-templates',
    'custom-requests',
    'orders',
    'production',
    'customer-access-support',
  ]);
  expect(ADMIN_PRIMARY_NAV.some((item) => item.href.includes('merge'))).toBe(false);
});

it('keeps the support entry current on its own route', () => {
  expect(isCurrentNavItem(entry as never, ADMIN_CUSTOMER_ACCESS_ROUTE)).toBe(true);
});

it('keeps the support section active on the merge selection route', () => {
  expect(resolveNavItemState(entry as never, ADMIN_CUSTOMER_MERGE_ROUTE)).toBe('section');
});

it('keeps the support section active on a merge case route', () => {
  expect(resolveNavItemState(entry as never, adminCustomerMergeCaseRoute('c1'))).toBe('section');
});

it('spells both merge addresses beneath the support route, in one place', () => {
  expect(ADMIN_CUSTOMER_MERGE_ROUTE).toBe('/support/customer-access/merge');
  expect(adminCustomerMergeCaseRoute('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70c1')).toBe(
    '/support/customer-access/merge/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70c1',
  );
});

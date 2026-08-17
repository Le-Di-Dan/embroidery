/**
 * Reaching the custom-request queue from the Admin shell (`APP5-A01`).
 *
 * The shell's own rule is that every primary-navigation entry points at a route
 * that exists. This asserts the new entry against the same route constant the
 * segment uses, so a label and a destination cannot drift apart.
 *
 * It also pins the authentication scope of this checkpoint: `/requests` lives
 * under the existing `(protected)` group and reaches `APP5-B04` through the one
 * shared browser client, so `APP5-A01` introduces no second session, token store
 * or login path. The backend guard itself is `APP1`/`APP5-B04` evidence and is
 * not re-proved here.
 */
import {
  ADMIN_PRIMARY_NAV,
  isCurrentNavItem,
  resolveNavItemState,
} from '../../src/features/admin-shell/model/admin-shell-nav';
import {
  ADMIN_REQUESTS_ROUTE,
  adminCustomRequestDetailRoute,
  CUSTOM_REQUEST_QUEUE_COPY,
} from '../../src/features/custom-request-queue';

const entry = ADMIN_PRIMARY_NAV.find((item) => item.id === 'custom-requests');

it('adds one primary navigation entry for the request queue', () => {
  expect(entry).toBeDefined();
  expect(entry?.href).toBe(ADMIN_REQUESTS_ROUTE);
  // The label comes from the owning capability, so there is one spelling.
  expect(entry?.label).toBe(CUSTOM_REQUEST_QUEUE_COPY.page.title);
});

it('marks the entry current on its own route', () => {
  expect(isCurrentNavItem(entry!, ADMIN_REQUESTS_ROUTE)).toBe(true);
});

it('keeps the queue reachable from the APP5-A02 detail route beneath it', () => {
  expect(resolveNavItemState(entry!, adminCustomRequestDetailRoute('some-id'))).toBe('section');
});

it('addresses the detail route without implementing it', () => {
  expect(adminCustomRequestDetailRoute('01940000-0000-7000-8000-000000000001')).toBe(
    '/requests/01940000-0000-7000-8000-000000000001',
  );
});

it('creates no APP5-specific session, credential or login surface', () => {
  const feature = jest.requireActual<Record<string, unknown>>(
    '../../src/features/custom-request-queue',
  );

  // The public surface is a screen, two route helpers, the copy catalog and the
  // cache identity — no client, no token accessor, no `adminId` input.
  expect(Object.keys(feature).sort()).toEqual([
    'ADMIN_REQUESTS_ROUTE',
    'CUSTOM_REQUEST_QUEUE_COPY',
    'CustomRequestQueueScreen',
    'adminCustomRequestDetailRoute',
    'customRequestQueueKeys',
  ]);
});

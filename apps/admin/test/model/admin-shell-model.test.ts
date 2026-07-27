import {
  classifySessionError,
  deriveSessionExpiry,
  SessionExpiredError,
  SessionRefetchError,
  STAFF_SELF_QUERY_KEY,
  STAFF_SELF_STALE_TIME_MS,
} from '../../src/features/admin-shell/model/session-expiry';
import {
  ADMIN_PRIMARY_NAV,
  isCurrentNavItem,
  type AdminNavItem,
} from '../../src/features/admin-shell/model/admin-shell-nav';
import { ADMIN_SHELL_COPY } from '../../src/features/admin-shell/model/admin-shell-copy';
import { ADMIN_ASSETS_ROUTE } from '../../src/features/assets/model/asset-route';
import { AUTHENTICATED_HOME_ROUTE } from '../../src/config/routes';
import { makeApiClientError, makeNetworkError } from '../support/api-error';

/** Every Admin route that exists today; the nav may not point anywhere else. */
const IMPLEMENTED_ADMIN_ROUTES = [AUTHENTICATED_HOME_ROUTE, ADMIN_ASSETS_ROUTE];

describe('session-expiry model', () => {
  it('keys the current-staff query stably and seeds a bounded, non-zero staleTime', () => {
    expect(STAFF_SELF_QUERY_KEY).toEqual(['staff', 'self']);
    expect(STAFF_SELF_STALE_TIME_MS).toBeGreaterThan(0);
    // Bounded — a short validation window, not a keep-alive.
    expect(STAFF_SELF_STALE_TIME_MS).toBeLessThanOrEqual(60_000);
  });

  it('classifies a 401 refetch as an expiry', () => {
    const error = classifySessionError(
      makeApiClientError({ status: 401, code: 'STAFF_SESSION_INVALID' }),
    );
    expect(error).toBeInstanceOf(SessionExpiredError);
  });

  it('classifies a network/5xx refetch as a transient reconnect', () => {
    expect(classifySessionError(makeNetworkError())).toBeInstanceOf(SessionRefetchError);
    expect(
      classifySessionError(makeApiClientError({ status: 503, code: 'UNAVAILABLE' })),
    ).toBeInstanceOf(SessionRefetchError);
  });

  it('derives active when there is no failure', () => {
    expect(deriveSessionExpiry({ error: null, failureReason: null })).toBe('active');
  });

  it('derives expired from either error or failureReason (data-present refetch)', () => {
    expect(deriveSessionExpiry({ error: new SessionExpiredError(), failureReason: null })).toBe(
      'expired',
    );
    expect(deriveSessionExpiry({ error: null, failureReason: new SessionExpiredError() })).toBe(
      'expired',
    );
  });

  it('derives reconnecting from a transient refetch failure', () => {
    expect(deriveSessionExpiry({ error: null, failureReason: new SessionRefetchError() })).toBe(
      'reconnecting',
    );
  });
});

describe('admin-shell nav + copy', () => {
  it('points every entry at an implemented route (no dead anchors)', () => {
    expect(ADMIN_PRIMARY_NAV.length).toBeGreaterThan(0);
    for (const item of ADMIN_PRIMARY_NAV) {
      expect(item.href.startsWith('/')).toBe(true);
      expect(IMPLEMENTED_ADMIN_ROUTES).toContain(item.href);
    }
  });

  it('derives the current location from the pathname, marking exactly one entry', () => {
    for (const pathname of IMPLEMENTED_ADMIN_ROUTES) {
      const current = ADMIN_PRIMARY_NAV.filter((item) => isCurrentNavItem(item, pathname));
      expect(current).toHaveLength(1);
      expect(current[0]?.href).toBe(pathname);
    }
  });

  it('never marks the authenticated home current on a nested route', () => {
    const home = ADMIN_PRIMARY_NAV.find((item) => item.href === '/');
    expect(home).toBeDefined();
    expect(isCurrentNavItem(home as AdminNavItem, ADMIN_ASSETS_ROUTE)).toBe(false);
  });

  it('uses a static Admin actor label, not an API role', () => {
    expect(ADMIN_SHELL_COPY.actor).toBe('Quản trị viên');
  });

  it('gives the desktop rail and the drawer distinct accessible names', () => {
    expect(ADMIN_SHELL_COPY.nav.sidebarLabel).not.toBe(ADMIN_SHELL_COPY.nav.drawerLabel);
  });
});

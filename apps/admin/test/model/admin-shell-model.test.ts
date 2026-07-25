import {
  classifySessionError,
  deriveSessionExpiry,
  SessionExpiredError,
  SessionRefetchError,
  STAFF_SELF_QUERY_KEY,
  STAFF_SELF_STALE_TIME_MS,
} from '../../src/features/admin-shell/model/session-expiry';
import { ADMIN_PRIMARY_NAV } from '../../src/features/admin-shell/model/admin-shell-nav';
import { ADMIN_SHELL_COPY } from '../../src/features/admin-shell/model/admin-shell-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';

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
  it('exposes only a current, non-link location (no dead routes)', () => {
    expect(ADMIN_PRIMARY_NAV.length).toBeGreaterThan(0);
    for (const item of ADMIN_PRIMARY_NAV) {
      expect(item.current).toBe(true);
      expect(item).not.toHaveProperty('href');
    }
  });

  it('uses a static Admin actor label, not an API role', () => {
    expect(ADMIN_SHELL_COPY.actor).toBe('Quản trị viên');
  });

  it('gives the desktop rail and the drawer distinct accessible names', () => {
    expect(ADMIN_SHELL_COPY.nav.sidebarLabel).not.toBe(ADMIN_SHELL_COPY.nav.drawerLabel);
  });
});

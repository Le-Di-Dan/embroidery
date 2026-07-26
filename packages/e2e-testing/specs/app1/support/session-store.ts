/**
 * Safe disposable-database session-mutation seam for the forced-expiry journey
 * (E01-J06). It opens its own short-lived connection to the run's disposable
 * database (`E2E_DATABASE_URL`, never the persistent dev database) using the
 * canonical `@embroidery/database` client factory — no bespoke driver, no
 * production revocation endpoint added for testing.
 *
 * `forceExpireAllAdminSessions` moves every ACTIVE admin session's expiry into
 * the past. The next `findActiveByTokenHash` (which requires `expiresAt > now`)
 * then returns nothing, so `GET /api/staff/me` answers 401 — exactly the
 * "session expired" condition the shell's modal is meant to surface. The
 * disposable database holds a single Admin with a single session, so this
 * targets precisely that session.
 */
import { createDatabaseClient, loadDatabaseConfig } from '@embroidery/database';

function disposableDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('E2E_DATABASE_URL is not set — the E01 suite must run via `pnpm e2e:app1`.');
  }
  return url;
}

async function withClient<T>(
  run: (query: (text: string) => Promise<{ rowCount: number }>) => Promise<T>,
): Promise<T> {
  const config = loadDatabaseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: disposableDatabaseUrl(),
    DATABASE_SSL_MODE: 'disable',
  });
  const client = createDatabaseClient(config);
  try {
    return await run(async (text) => {
      const result = await client.pool.query(text);
      return { rowCount: result.rowCount ?? 0 };
    });
  } finally {
    await client.close();
  }
}

/** Expires every ACTIVE admin session in the disposable database. Returns the count. */
export async function forceExpireAllAdminSessions(): Promise<number> {
  return withClient(async (query) => {
    const result = await query(
      "UPDATE admin_sessions SET expires_at = now() - interval '1 minute', updated_at = now() WHERE status = 'ACTIVE'",
    );
    return result.rowCount;
  });
}

/** Counts ACTIVE, unexpired admin sessions — used to prove login/expiry state. */
export async function countLiveAdminSessions(): Promise<number> {
  return withClient(async (query) => {
    const result = await query(
      "SELECT id FROM admin_sessions WHERE status = 'ACTIVE' AND expires_at > now()",
    );
    return result.rowCount;
  });
}

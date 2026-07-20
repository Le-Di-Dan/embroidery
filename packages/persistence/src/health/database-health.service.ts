/**
 * Database health for liveness/readiness reporting (DB7-CP1 §8.3).
 *
 * Distinguishes the failure kinds an operator needs to tell apart, because
 * "database down" and "pool exhausted" have opposite remedies. Nothing here
 * emits a connection URL, user, password or driver message — only a stable
 * status, a coarse reason and pool counters.
 */
import { Inject, Injectable } from '@nestjs/common';
import { driverErrorCode } from '@embroidery/database';

import { DATABASE_CONNECTION } from '../runtime/database.tokens';
import type { DatabaseConnection } from '../runtime/database-connection';

export type DatabaseHealthStatus = 'up' | 'degraded' | 'down';

export type DatabaseHealthReason =
  'ok' | 'pool_saturated' | 'connection_failed' | 'query_failed' | 'configuration_failed';

export interface DatabaseHealth {
  readonly status: DatabaseHealthStatus;
  readonly reason: DatabaseHealthReason;
  readonly pool: { total: number; idle: number; waiting: number; max: number };
  readonly latencyMs: number | null;
}

/** libpq/Node connection-layer errnos, as opposed to a SQLSTATE from a live session. */
const CONNECTION_ERRNOS: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

@Injectable()
export class DatabaseHealthService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  async check(): Promise<DatabaseHealth> {
    const startedAt = Date.now();

    try {
      await this.connection.database.execute('SELECT 1');
    } catch (error: unknown) {
      // Read the stats *after* the failure: a probe that could not acquire a
      // connection is exactly when the waiting/idle counts are informative.
      return {
        status: 'down',
        reason: classifyFailure(error),
        pool: this.connection.poolStats,
        latencyMs: null,
      };
    }

    const pool = this.connection.poolStats;
    const latencyMs = Date.now() - startedAt;

    // Waiting acquirers mean demand already exceeds the pool: the database is
    // reachable, so this is not "down", but it is not healthy either.
    if (pool.waiting > 0) {
      return { status: 'degraded', reason: 'pool_saturated', pool, latencyMs };
    }

    return { status: 'up', reason: 'ok', pool, latencyMs };
  }
}

function classifyFailure(error: unknown): DatabaseHealthReason {
  // Drizzle wraps the driver error, so the code lives on `cause`, not here.
  const code = driverErrorCode(error);
  if (code === undefined) {
    return 'query_failed';
  }
  if (CONNECTION_ERRNOS.has(code)) {
    return 'connection_failed';
  }
  // 28xxx = invalid authorization / invalid password; 3D000 = database does not
  // exist. Both are configuration mistakes, not outages, and an operator who
  // sees "connection_failed" for them will debug the wrong thing.
  if (code.startsWith('28') || code === '3D000') {
    return 'configuration_failed';
  }
  return 'query_failed';
}

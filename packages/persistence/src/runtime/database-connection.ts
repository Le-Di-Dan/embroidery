/**
 * Owns the one `pg` Pool of an application instance (DB7-CP1).
 *
 * Creating the pool is cheap; *validating* it is not, so startup validation is
 * an explicit step (`validate`) invoked by the module's lifecycle hook rather
 * than hidden in the constructor — a constructor that performs I/O cannot
 * report a failure without leaving a half-built provider behind.
 */
import { Logger } from '@nestjs/common';
import type { DatabaseClient, DatabaseConfig } from '@embroidery/database';
import { createDatabaseClient, redactUrl } from '@embroidery/database';

export class DatabaseConnection {
  private readonly logger = new Logger(DatabaseConnection.name);
  private readonly client: DatabaseClient;
  private closed = false;

  constructor(private readonly config: DatabaseConfig) {
    this.client = createDatabaseClient(config);
  }

  /** The typed Drizzle handle. Infrastructure-only; never injected into application code. */
  get database(): DatabaseClient['db'] {
    this.assertOpen();
    return this.client.db;
  }

  /** Pool statistics for the health indicator. No credential is exposed. */
  get poolStats(): { total: number; idle: number; waiting: number; max: number } {
    return {
      total: this.client.pool.totalCount,
      idle: this.client.pool.idleCount,
      waiting: this.client.pool.waitingCount,
      max: this.config.poolMax,
    };
  }

  /**
   * Proves the pool can hand out a working connection.
   *
   * On failure the partially-created pool is closed before rethrowing, so a
   * failed startup does not leak sockets or keep the process alive on an
   * orphaned handle.
   */
  async validate(): Promise<void> {
    try {
      const connection = await this.client.pool.connect();
      try {
        await connection.query('SELECT 1');
      } finally {
        connection.release();
      }
    } catch (error: unknown) {
      await this.close();
      throw new Error(
        `Database startup validation failed for ${redactUrl(this.config.url)}: ${describe(error)}`,
        // The cause is kept for the process's own crash log, which is trusted.
        // It never reaches a client: this error is raised during bootstrap, and
        // the application does not start if it is thrown.
        { cause: error },
      );
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.client.close();
    this.logger.log('database pool closed');
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('The database connection has been closed.');
    }
  }
}

/**
 * Reduces a driver error to a code/message pair.
 *
 * `pg` puts the SQLSTATE (or a libpq errno such as `ECONNREFUSED`) on `code`
 * and never puts a credential there, whereas the message of a connection
 * failure can contain the host and user. Prefer the code; fall back to a fixed
 * string rather than echoing an unknown value.
 */
function describe(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code !== '') {
      return code;
    }
  }
  return 'unknown driver error';
}

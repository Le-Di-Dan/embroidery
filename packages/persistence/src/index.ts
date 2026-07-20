/**
 * `@embroidery/persistence` — the NestJS persistence runtime (DB7).
 *
 * Owner: backend/persistence. Consumers: `@embroidery/api`, `@embroidery/worker`.
 *
 * Application and domain code may depend on the transaction abstraction and the
 * repository interfaces their own module declares. It must not import
 * `DatabaseExecutor`, `DatabaseConnection`, `pg` or Drizzle types — those are
 * infrastructure-only (`CLAUDE.md` §5, `BACKEND_CONVENTIONS.md` §3).
 */
export { DatabaseModule } from './database.module';

export { DATABASE_CONFIG, DATABASE_CONNECTION } from './runtime/database.tokens';
export { DatabaseConnection } from './runtime/database-connection';
export type { DatabaseExecutorHandle } from './runtime/database-executor';
export { DatabaseExecutor } from './runtime/database-executor';

export type { TransactionRunOptions } from './transaction/transaction-manager';
export { TransactionManager } from './transaction/transaction-manager';
export { transactionContext } from './transaction/transaction-context';

export type {
  DatabaseHealth,
  DatabaseHealthReason,
  DatabaseHealthStatus,
} from './health/database-health.service';
export { DatabaseHealthService } from './health/database-health.service';

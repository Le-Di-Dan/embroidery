/**
 * Persistence runtime for the NestJS applications (DB7-CP1).
 *
 * Deliberately **not** `@Global()`: a module that touches the database says so
 * by importing this one, which keeps the dependency graph honest and stops
 * presentation-layer code from acquiring database access by accident
 * (`BACKEND_CONVENTIONS.md` §22).
 */
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Logger, Module } from '@nestjs/common';
import type { DatabaseConfig } from '@embroidery/database';
import { loadDatabaseConfig } from '@embroidery/database';

import { DATABASE_CONFIG, DATABASE_CONNECTION } from './runtime/database.tokens';
import { DatabaseConnection } from './runtime/database-connection';
import { DatabaseExecutor } from './runtime/database-executor';
import { DatabaseHealthService } from './health/database-health.service';
import { TransactionManager } from './transaction/transaction-manager';
import { IdempotencyStore } from './platform/idempotency-store';
import { OutboxEventStore } from './platform/outbox-event-store';
import { BackgroundJobAttemptStore } from './platform/background-job-attempt-store';
import { PolicyConfigurationRepository } from './platform/policy-configuration.repository';
import { WorkerJobQueueRepository } from './platform/worker-job-queue.repository';

@Module({
  providers: [
    {
      provide: DATABASE_CONFIG,
      // Validation happens here, at construction, so a misconfigured process
      // fails during bootstrap rather than on its first request.
      useFactory: (): DatabaseConfig => loadDatabaseConfig(process.env),
    },
    {
      provide: DATABASE_CONNECTION,
      inject: [DATABASE_CONFIG],
      useFactory: (config: DatabaseConfig): DatabaseConnection => new DatabaseConnection(config),
    },
    DatabaseExecutor,
    TransactionManager,
    DatabaseHealthService,
    // CTX-PLT platform primitives (DEC-DB7-003): infrastructure records with no
    // business invariants of their own, shared by the API and the worker.
    IdempotencyStore,
    OutboxEventStore,
    BackgroundJobAttemptStore,
    PolicyConfigurationRepository,
    // APP2-I02 — the atomic claim/completion seam the worker runtime drives.
    WorkerJobQueueRepository,
  ],
  exports: [
    DatabaseExecutor,
    TransactionManager,
    DatabaseHealthService,
    DATABASE_CONNECTION,
    IdempotencyStore,
    OutboxEventStore,
    BackgroundJobAttemptStore,
    PolicyConfigurationRepository,
    WorkerJobQueueRepository,
  ],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  async onModuleInit(): Promise<void> {
    await this.connection.validate();
    this.logger.log('database pool validated');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { AdminCategoryQuery } from './application/admin-category.query';
import { AdminCategoryRecorder } from './application/admin-category.recorder';
import { AdminCategoryService } from './application/admin-category.service';
import { ADMIN_CATEGORY_REPOSITORY } from './domain/repositories/admin-category.repository';
import { DrizzleAdminCategoryRepository } from './infrastructure/persistence/drizzle-admin-category.repository';
import { AdminCategoryController } from './presentation/admin-category.controller';

/**
 * The Admin category management feature (`APP12-C02`).
 *
 * Its own module, for the reason `CatalogDraftModule` and
 * `CatalogPublicationModule` are separate from `CatalogModule`: this graph has
 * its own repository, its own controller and its own dependencies — the Audit
 * repository and the platform Outbox store — and a suite that exercises the
 * category lifecycle should not have to stand up the placement hierarchy to do
 * it.
 *
 * Deliberately absent: `PUBLIC_CATEGORY_REPOSITORY`. The public read port
 * applies the anonymous visibility predicate and this surface must see every
 * row in every state; wiring both here would put two different answers to
 * "which categories are there" in one graph. `CatalogPublicModule` keeps its
 * read and, by the same argument in reverse, cannot reach anything in this one —
 * no route in the public graph can mutate a category, and that is a composition
 * fact rather than a convention a reviewer has to trust.
 *
 * `DatabaseModule` supplies `TransactionManager` and `OutboxEventStore`; the
 * audit clock and request context come from their global platform modules.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule],
  controllers: [AdminCategoryController],
  providers: [
    { provide: ADMIN_CATEGORY_REPOSITORY, useClass: DrizzleAdminCategoryRepository },
    AdminCategoryRecorder,
    AdminCategoryService,
    AdminCategoryQuery,
  ],
})
export class CatalogAdminCategoryModule {}

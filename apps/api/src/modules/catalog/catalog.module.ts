import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CATALOG_SUBJECT_PORT } from './domain/repositories/catalog-subject.port';
import { PLACEMENT_HIERARCHY_PORT } from './domain/repositories/placement-hierarchy.port';
import { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY } from './domain/repositories/product.repository';
import { DrizzleCatalogSubjectAdapter } from './infrastructure/persistence/drizzle-catalog-subject.adapter';
import { DrizzleCategoryRepository } from './infrastructure/persistence/drizzle-category.repository';
import { DrizzlePlacementHierarchyAdapter } from './infrastructure/persistence/drizzle-placement-hierarchy.adapter';
import { DrizzleProductRepository } from './infrastructure/persistence/drizzle-product.repository';

/**
 * CTX-CAT — catalog persistence (DB7-CP3).
 *
 * Exports `PLACEMENT_HIERARCHY_PORT` so Design, Approval and Production can
 * validate a placement chain (G-DB7-10..13) without importing this module's
 * repositories or reading its tables (`BACKEND_CONVENTIONS.md` §10), and
 * `CATALOG_SUBJECT_PORT` so `APP5-B03` can name a request's catalog subject on
 * the same terms.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
    { provide: PRODUCT_REPOSITORY, useClass: DrizzleProductRepository },
    { provide: PLACEMENT_HIERARCHY_PORT, useClass: DrizzlePlacementHierarchyAdapter },
    { provide: CATALOG_SUBJECT_PORT, useClass: DrizzleCatalogSubjectAdapter },
  ],
  exports: [
    CATEGORY_REPOSITORY,
    PRODUCT_REPOSITORY,
    PLACEMENT_HIERARCHY_PORT,
    CATALOG_SUBJECT_PORT,
  ],
})
export class CatalogModule {}

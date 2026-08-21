import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CustomerModule } from '../customer/customer.module';
import { IdentityModule } from '../identity/identity.module';
import { QuotationModule } from '../quotation/quotation.module';
import { CUSTOM_REQUEST_ADMIN_REPOSITORY } from './domain/repositories/custom-request-admin.repository';
import { DrizzleCustomRequestAdminRepository } from './infrastructure/persistence/drizzle-custom-request-admin.repository';
import { ReadAdminRequestDetail } from './application/admin/read-admin-request-detail.query';
import { ReadAdminRequestQueue } from './application/admin/read-admin-request-queue.query';
import { AdminCustomRequestController } from './presentation/admin-custom-request.controller';

/**
 * `APP5-B04` — the Admin request queue and detail.
 *
 * A **fourth** APP5 module beside submission, intake and the customer status
 * read, on the pattern `CustomerAdminSupportModule` and
 * `DesignTemplateAdminModule` set: a staff surface is not folded into the module
 * that answers anonymous callers. Those three are public stacks with no
 * staff-auth dependency, and folding two authenticated routes into any of them
 * would put `IdentityModule` and its session repository into a module that
 * serves customers, and would make `AuthenticatedAdminGuard` resolvable from
 * controllers that must never use it.
 *
 * It does **not** import `OrderModule`. That module holds the AGG-13 write
 * repository, and nothing here writes; this read model is a separate contract,
 * so importing the write side would hand a read surface a `transition()` it must
 * never call. `APP5-B05` will compose the write side deliberately.
 *
 * Every cross-context import is a port or an exported capability, never another
 * context's tables:
 *
 * - `IdentityModule` — the APP1 guard, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `CatalogModule` — `CATALOG_SUBJECT_PORT` only, so Catalog keeps owning
 *   product and variant rows;
 * - `CustomerModule` — `ADMIN_CUSTOMER_SUMMARY_PORT` only, which masks contacts
 *   inside Customer before they cross;
 * - `AssetModule` — `ASSET_REPOSITORY` only, for attachment metadata. Asset
 *   keeps owning the file; Ordering owns the association;
 * - `QuotationModule` — `QUOTATION_LOCATOR_PORT` only (`APP6-A01` §4): the id of
 *   the request’s quotation, so the Admin workbench can address `APP6-B02`
 *   after a reload. Not `QUOTATION_REPOSITORY`, which would make sending and
 *   accepting reachable from a read module;
 * - `DatabaseModule` — the executor the read adapter is built on.
 *
 * It exports nothing. There are two entry points and both are HTTP operations.
 */
@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    CatalogModule,
    CustomerModule,
    AssetModule,
    QuotationModule,
  ],
  controllers: [AdminCustomRequestController],
  providers: [
    { provide: CUSTOM_REQUEST_ADMIN_REPOSITORY, useClass: DrizzleCustomRequestAdminRepository },
    ReadAdminRequestQueue,
    ReadAdminRequestDetail,
  ],
})
export class CustomRequestAdminModule {}

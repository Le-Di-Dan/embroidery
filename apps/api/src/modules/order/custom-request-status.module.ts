import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogModule } from '../catalog/catalog.module';
import { CustomerModule } from '../customer/customer.module';
import { CUSTOM_REQUEST_STATUS_REPOSITORY } from './domain/repositories/custom-request-status.repository';
import { DrizzleCustomRequestStatusRepository } from './infrastructure/persistence/drizzle-custom-request-status.repository';
import { ReadGrantScopedRequest } from './application/status/read-grant-scoped-request.query';
import { PublicCustomRequestStatusController } from './presentation/public-custom-request-status.controller';

/**
 * `APP5-B03` — the grant-scoped customer read.
 *
 * A third APP5 module beside `CustomRequestSubmissionModule` and
 * `CustomRequestIntakeModule`, on the pattern both of those record and for the
 * same reason: a genuinely different dependency shape. Submission needs Design
 * (sessions, cases), the grant **issuer** and the idempotency store; intake
 * needs a configured object store. This read needs none of them — it needs the
 * secure-link **admission** and a way to name a catalog subject — and folding it
 * into either would make every consumer of that module boot dependencies this
 * surface never calls.
 *
 * It does **not** import `OrderModule`. That module holds the AGG-13 write
 * repository, and nothing here writes; the read model is a separate contract
 * with its own narrow adapter, so importing the write side would hand this
 * surface a `transition()` it must never call.
 *
 * Every cross-context import is a port or an exported capability, never another
 * context's tables:
 *
 * - `CustomerModule` — `AuthorizeSecureLink` only. APP4 owns the policy read,
 *   the abuse budget, the digest and GRD-002; this module consumes the result
 *   and holds no token handling of its own;
 * - `CatalogModule` — `CATALOG_SUBJECT_PORT` only, so Catalog keeps owning
 *   product and variant rows and this module never reads them;
 * - `DatabaseModule` — the executor the read adapter is built on.
 *
 * It exports nothing. There is one entry point and it is the HTTP operation.
 */
@Module({
  imports: [DatabaseModule, CustomerModule, CatalogModule],
  controllers: [PublicCustomRequestStatusController],
  providers: [
    { provide: CUSTOM_REQUEST_STATUS_REPOSITORY, useClass: DrizzleCustomRequestStatusRepository },
    ReadGrantScopedRequest,
  ],
})
export class CustomRequestStatusModule {}

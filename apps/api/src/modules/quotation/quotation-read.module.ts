import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { QuotationModule } from './quotation.module';
import { ReadQuotationVersionDetail } from './application/reads/read-quotation-version-detail.query';
import { ReadQuotationVersionHistory } from './application/reads/read-quotation-version-history.query';
import { AdminQuotationVersionController } from './presentation/admin-quotation-version.controller';

/**
 * `APP6-B02` — the Admin quotation read surface.
 *
 * Composed beside `QuotationDraftingModule` rather than inside it, which is the
 * arrangement `APP6-B01` wrote down: the context module
 * (`quotation.module.ts`) publishes the AGG-14 repository port and stays free of
 * controllers, and each delivered surface assembles what it needs around that
 * port. `APP5-B05` settled the same shape for the request surface, for the same
 * reason — what a module can inject is what its routes can eventually do.
 *
 * Its dependencies are **two**, and the short list is the point:
 *
 * - `QuotationModule` — `QUOTATION_REPOSITORY`, the delivered AGG-14 contract.
 *   No persistence is re-implemented here and no second quotation repository
 *   exists;
 * - `IdentityModule` — the APP1 guard, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried.
 *
 * What is **absent** is what keeps this a read module. There is no
 * `DatabaseModule` import, so no `TransactionManager` and no executor can be
 * injected: nothing composed here can open a transaction, and a write that
 * needed one could not be added without changing this file. There is no
 * `OrderModule`, so no custom request can be transitioned and
 * `current_quotation_id` cannot be set from here — that pointer belongs to
 * `APP6-B03`. There is no policy reader, so a deposit share cannot be
 * recomputed from today's policy while pretending to report a historical one.
 * There is no pricing import, no notification module, no outbox recorder and no
 * grant issuer.
 *
 * It exports nothing. There are two entry points and both are `GET`.
 */
@Module({
  imports: [IdentityModule, QuotationModule],
  controllers: [AdminQuotationVersionController],
  providers: [ReadQuotationVersionHistory, ReadQuotationVersionDetail],
})
export class QuotationReadModule {}

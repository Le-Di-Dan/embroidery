import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { QUOTATION_LOCATOR_PORT } from './domain/repositories/quotation-locator.port';
import { QUOTATION_REPOSITORY } from './domain/repositories/quotation.repository';
import { DrizzleQuotationLocator } from './infrastructure/persistence/drizzle-quotation-locator.adapter';
import { DrizzleQuotationRepository } from './infrastructure/persistence/drizzle-quotation.repository';

/**
 * CTX-QUO — manual pricing with immutable-once-sent versions (DB7-CP4).
 *
 * It publishes two ports and no controller. `QUOTATION_REPOSITORY` is the
 * delivered AGG-14 contract every quotation surface composes around.
 * `QUOTATION_LOCATOR_PORT` (`APP6-A01` §4) is a read-only sliver of it for one
 * consumer outside this context — the Admin request-detail read — which needs to
 * *address* a quotation and must not be able to write one.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: QUOTATION_REPOSITORY, useClass: DrizzleQuotationRepository },
    { provide: QUOTATION_LOCATOR_PORT, useClass: DrizzleQuotationLocator },
  ],
  exports: [QUOTATION_REPOSITORY, QUOTATION_LOCATOR_PORT],
})
export class QuotationModule {}

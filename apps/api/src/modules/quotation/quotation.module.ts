import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { QUOTATION_REPOSITORY } from './domain/repositories/quotation.repository';
import { DrizzleQuotationRepository } from './infrastructure/persistence/drizzle-quotation.repository';

/** CTX-QUO — manual pricing with immutable-once-sent versions (DB7-CP4). */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: QUOTATION_REPOSITORY, useClass: DrizzleQuotationRepository }],
  exports: [QUOTATION_REPOSITORY],
})
export class QuotationModule {}

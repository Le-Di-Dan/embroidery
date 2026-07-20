import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CUSTOM_REQUEST_REPOSITORY } from './domain/repositories/custom-request.repository';
import { DrizzleCustomRequestRepository } from './infrastructure/persistence/drizzle-custom-request.repository';

/**
 * CTX-ORD — Ordering (DB7-CP4).
 *
 * Hosts AGG-13 Custom Request and (from part 3) AGG-15 Order: DB2's bounded
 * context map places the request inside Ordering as a separate aggregate,
 * while REPOSITORY_STRUCTURE §7 names the directory `order/` (DEC-DB7-008).
 */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: CUSTOM_REQUEST_REPOSITORY, useClass: DrizzleCustomRequestRepository }],
  exports: [CUSTOM_REQUEST_REPOSITORY],
})
export class OrderModule {}

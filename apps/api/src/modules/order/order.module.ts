import { Module } from '@nestjs/common';
import { DatabaseModule, OrderPersistenceModule } from '@embroidery/persistence';

import { CUSTOM_REQUEST_REPOSITORY } from './domain/repositories/custom-request.repository';
import { DrizzleCustomRequestRepository } from './infrastructure/persistence/drizzle-custom-request.repository';

/**
 * CTX-ORD — Ordering (DB7-CP4).
 *
 * Hosts AGG-13 Custom Request and AGG-15 Order: DB2's bounded context map
 * places the request inside Ordering as a separate aggregate, while
 * REPOSITORY_STRUCTURE §7 names the directory `order/` (DEC-DB7-008).
 *
 * AGG-15's implementation moved to `@embroidery/persistence` in `APP7-W01-C1`,
 * because the worker creates orders too and an application may not import
 * another application. This module now **imports** that one implementation and
 * re-exports `ORDER_REPOSITORY`, so every API consumer resolves what it always
 * did — the same class, through the same token — and there is no second Order
 * writer anywhere in the repository.
 *
 * AGG-13 stays here: the Custom Request is written by the API alone.
 */
@Module({
  imports: [DatabaseModule, OrderPersistenceModule],
  providers: [{ provide: CUSTOM_REQUEST_REPOSITORY, useClass: DrizzleCustomRequestRepository }],
  // Nest re-exports a **module**, not a token it does not itself provide, so
  // `OrderPersistenceModule` is exported whole: an API consumer importing
  // `OrderModule` still resolves `ORDER_REPOSITORY` exactly as it always did.
  exports: [CUSTOM_REQUEST_REPOSITORY, OrderPersistenceModule],
})
export class OrderModule {}

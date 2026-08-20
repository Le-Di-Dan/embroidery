import { Module } from '@nestjs/common';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { CustomerModule } from '../customer/customer.module';
import { CustomRequestQuotationPointerModule } from '../order/custom-request-quotation-pointer.module';
import { QuotationModule } from './quotation.module';
import { ReadCurrentQuotation } from './application/customer/read-current-quotation.query';
import { PublicQuotationController } from './presentation/public-quotation.controller';

/**
 * `APP6-B04` — the customer's grant-scoped quotation read.
 *
 * A fourth quotation module beside `QuotationDraftingModule`,
 * `QuotationReadModule` and `QuotationSendModule`, on the arrangement all three
 * record: the context module (`quotation.module.ts`) publishes the AGG-14
 * repository port and stays free of controllers, and each delivered surface
 * assembles what it needs around that port. What a module can inject is what its
 * routes can eventually do — and this is the first APP6 surface an
 * **unauthenticated** caller can reach, so the list below is the checkpoint's
 * security boundary as much as its wiring.
 *
 * Its dependencies are four:
 *
 * - `CustomerModule` — `AuthorizeSecureLink` only. APP4 owns the policy read,
 *   the abuse budget, the digest and GRD-002; this module consumes the result
 *   and holds no token handling of its own. It issues nothing: `APP6-B04` reuses
 *   the `REQUEST_ACCESS` grant APP5 created at submission and mints no token, no
 *   scope kind and no second secure-link architecture;
 * - `CustomRequestQuotationPointerModule` — one read-only Ordering port, so this
 *   surface can follow `custom_requests.current_quotation_id` without ever
 *   reading Ordering's tables;
 * - `QuotationModule` — `QUOTATION_REPOSITORY`, the delivered AGG-14 contract.
 *   No persistence is re-implemented here and no second quotation repository
 *   exists;
 * - `AuditContextModule` — `AuditClock`, so the elapsed-validity comparison
 *   reads an injectable clock a suite can pin instead of calling `new Date()`
 *   inside the projection.
 *
 * What is **absent** is what keeps this a read. There is no `DatabaseModule`
 * import, so no `TransactionManager` and no executor can be injected: nothing
 * composed here can open a transaction, and a write that needed one could not be
 * added without changing this file. There is no `OrderModule`, so
 * `CUSTOM_REQUEST_REPOSITORY` is out of reach and no route here can transition a
 * request or move a pointer. There is no `QuotationSendModule` and no
 * `QuotationDraftingModule`, so no Admin mutation service is reachable from a
 * public controller. There is no `AuditModule` and no `OutboxEventStore`, so
 * reading a quotation cannot append business evidence; there is no policy
 * reader, so a deposit share cannot be recomputed from today's policy; and there
 * is no grant issuer, no step-up window and no notification module.
 *
 * It exports nothing. There is one entry point and it is the HTTP operation.
 */
@Module({
  imports: [
    AuditContextModule,
    CustomerModule,
    CustomRequestQuotationPointerModule,
    QuotationModule,
  ],
  controllers: [PublicQuotationController],
  providers: [ReadCurrentQuotation],
})
export class CustomerQuotationModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OrderModule } from '../order/order.module';
import { QuotationModule } from './quotation.module';
import { SendQuotationVersionUseCase } from './application/sending/send-quotation-version.use-case';
import { QuotationSendRecorder } from './application/sending/quotation-send.recorder';
import { QuotationValidityPolicyReader } from './infrastructure/policy/quotation-validity-policy.reader';
import { AdminQuotationSendController } from './presentation/admin-quotation-send.controller';

/**
 * `APP6-B03` — the Admin quotation send surface (`TR-LC12-02`).
 *
 * Composed beside `QuotationDraftingModule` and `QuotationReadModule`, which is
 * the arrangement both of them wrote down: the context module
 * (`quotation.module.ts`) publishes the AGG-14 repository port and stays free of
 * controllers, and each delivered surface assembles what it needs around that
 * port. What a module can inject is what its routes can eventually do, and this
 * is the first APP6 surface that may move a custom request.
 *
 * Its dependencies are five, and each is a boundary:
 *
 * - `QuotationModule` — `QUOTATION_REPOSITORY`, the delivered AGG-14 contract.
 *   No persistence is re-implemented here and no second quotation repository
 *   exists;
 * - `OrderModule` — `CUSTOM_REQUEST_REPOSITORY`, CTX-ORD's own AGG-13 contract.
 *   The send locks the request, points it at this quotation and projects
 *   `TR-LC11-05` through that published port — never by touching Ordering's
 *   tables;
 * - `AuditModule` — `AUDIT_EVENT_REPOSITORY`, for the `quotation.sent` evidence;
 * - `IdentityModule` — the APP1 guards, and nothing else;
 * - `DatabaseModule` — the executor, `TransactionManager` for the send
 *   transaction, `OutboxEventStore` for the SE-004 event and
 *   `PolicyConfigurationRepository` for the published validity window.
 *
 * What is **absent** bounds the checkpoint. There is no pricing import and no
 * deposit policy reader, so nothing composed here can re-price a version. There
 * is no notification module, no grant issuer and no secure-link resolver: the
 * customer-facing half of the send is `APP6-B04`, and delivery of the outbox
 * event is the delivered APP4 worker's, after commit. There is no design module.
 *
 * It exports nothing. There is one entry point and it is one HTTP operation.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule, OrderModule, QuotationModule],
  controllers: [AdminQuotationSendController],
  providers: [QuotationValidityPolicyReader, QuotationSendRecorder, SendQuotationVersionUseCase],
})
export class QuotationSendModule {}

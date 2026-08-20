import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../platform/request-context/request-context.module';
import { AuditModule } from '../audit/audit.module';
import { CustomerModule } from '../customer/customer.module';
import { CustomRequestQuotationPointerModule } from '../order/custom-request-quotation-pointer.module';
import { OrderModule } from '../order/order.module';
import { QuotationModule } from './quotation.module';
import { AcceptQuotationUseCase } from './application/customer/accept-quotation.use-case';
import { RejectQuotationUseCase } from './application/customer/reject-quotation.use-case';
import { QuotationDecisionRecorder } from './application/customer/quotation-decision.recorder';
import { QuotationDecisionTargetResolver } from './application/customer/quotation-decision.target';
import { PublicQuotationDecisionController } from './presentation/public-quotation-decision.controller';

/**
 * `APP6-B05` — the customer's two grant-scoped quotation decisions.
 *
 * A **fifth** quotation module, beside `QuotationDraftingModule`,
 * `QuotationReadModule`, `QuotationSendModule` and `APP6-B04`'s
 * `CustomerQuotationModule`, on the arrangement all four record: the context
 * module (`quotation.module.ts`) publishes the AGG-14 repository port and stays
 * free of controllers, and each delivered surface assembles what it needs around
 * that port.
 *
 * ### Why not simply widen `CustomerQuotationModule`
 *
 * Because that module's documented security property is an **absence**: it
 * imports no `DatabaseModule` and no `OrderModule`, so nothing composed there
 * can open a transaction or transition a request, and a write that needed one
 * could not be added without changing the file. These two routes need exactly
 * those things. Merging them in would delete `APP6-B04`'s property to gain
 * nothing — the read and the writes share no provider — and would leave one
 * module whose injector explains neither surface. The `APP5-B03` /
 * `APP5-B04-B05` splits were made for the same reason, and
 * `CONTROLLER_DOMAIN_KEYS` keeps both halves publishing one domain.
 *
 * ### What this module may inject, which is what its routes may eventually do
 *
 * - `CustomerModule` — three capabilities and no machinery.
 *   `AuthorizeSecureLink` for the pre-transaction admission (identical policy,
 *   budget and digest to the read); `ReauthorizeSecureGrant` for the
 *   in-transaction, row-locked re-check ADR-DB3-004 r9 requires; and
 *   `StepUpEvidenceResolver` for GRD-003. It issues nothing: `APP6-B05` reuses
 *   the `REQUEST_ACCESS` grant APP5 created at submission and mints no token, no
 *   scope kind and no second secure-link architecture. The pepper provider, the
 *   token minter, the grant issuer, the rate limiter and the notification
 *   module all stay out of reach;
 * - `CustomRequestQuotationPointerModule` — the one read-only Ordering port, so
 *   the target chain can follow `custom_requests.current_quotation_id` without
 *   reading Ordering's tables;
 * - `OrderModule` — `CUSTOM_REQUEST_REPOSITORY`, for the **acceptance** half
 *   only: `lockById` and the `TR-LC11-06` projection. This is the one dependency
 *   `APP6-B04` deliberately refused, and it is here because acceptance's whole
 *   contract is that the request move commits in the same transaction. The
 *   rejection use case does not inject it, which is what makes "a rejected
 *   quotation is not a rejected request" structural rather than remembered;
 * - `QuotationModule` — `QUOTATION_REPOSITORY`, the delivered AGG-14 contract.
 *   No persistence is re-implemented and no second quotation repository exists;
 * - `DatabaseModule` — `TransactionManager` and `IdempotencyStore`. The
 *   delivered claim mechanism, not a parallel one;
 * - `AuditModule` — the append-only audit repository, for the two decision rows;
 * - `AuditContextModule` and `RequestContextModule` — the injectable clock and
 *   the correlation id the audit row and the transition both carry.
 *
 * ### What is absent, and what each absence prevents
 *
 * There is no `OutboxEventStore` binding of any kind, so neither decision can
 * emit an event — `APP6-G01` §9 records `quotation.accepted` and
 * `quotation.rejected` as **not** emitted, and an event here would create a
 * side-effect contract no consumer was designed against. There is no
 * `NotificationModule`. There is no order, payment or inventory module, so
 * APP7's work is unreachable from an acceptance rather than merely undone. There
 * is no `QuotationDraftingModule` and no `QuotationSendModule`, so no Admin
 * mutation is reachable from a public controller, and no policy reader, so no
 * amount can be re-derived from today's pricing policy.
 *
 * It exports nothing. There are two entry points and they are the HTTP
 * operations.
 */
@Module({
  imports: [
    AuditContextModule,
    RequestContextModule,
    AuditModule,
    CustomerModule,
    CustomRequestQuotationPointerModule,
    DatabaseModule,
    OrderModule,
    QuotationModule,
  ],
  controllers: [PublicQuotationDecisionController],
  providers: [
    QuotationDecisionTargetResolver,
    QuotationDecisionRecorder,
    AcceptQuotationUseCase,
    RejectQuotationUseCase,
  ],
})
export class CustomerQuotationDecisionModule {}

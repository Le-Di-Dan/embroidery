import { Module } from '@nestjs/common';

import { CustomerModule } from '../customer/customer.module';
import { CustomRequestDesignContextModule } from '../order/custom-request-design-context.module';
import { DesignReviewReadModule } from './design-review-read.module';
import { ReadCurrentDesignReview } from './application/review/read-current-design-review.query';
import { PublicDesignReviewController } from './presentation/public-design-review.controller';

/**
 * `APP6-B10` — the customer's grant-scoped design review read.
 *
 * The mirror of `CustomerQuotationModule` for the design lane, assembled on the
 * same rule that module records: the context module (`design.module.ts`)
 * publishes the AGG-10 repository and the Session stack, and each delivered
 * surface assembles what it needs around narrow ports. What a module can inject
 * is what its routes can eventually do — and this is the first APP6 surface an
 * **unauthenticated** caller can reach that returns a customer's artwork, so the
 * list below is the checkpoint's security boundary as much as its wiring.
 *
 * Its dependencies are three:
 *
 * - `CustomerModule` — `AuthorizeSecureLink` only. APP4 owns the policy read,
 *   the abuse budget, the digest and GRD-002; this module consumes the result
 *   and holds no token handling of its own. It issues nothing: `APP6-B10` reuses
 *   the `REQUEST_ACCESS` grant APP5 created at submission and mints no token, no
 *   scope kind and no second secure-link architecture;
 * - `CustomRequestDesignContextModule` — one read-only Ordering port, so this
 *   surface can follow `custom_requests.current_design_case_id` without ever
 *   reading Ordering's tables. `findDesignContext`, never `lockDesignContext`;
 * - `DesignReviewReadModule` — the narrow design and agreement **reads**, and
 *   nothing else. That module absorbs `DatabaseModule`, `ContentModule` and the
 *   write halves of both without re-exporting them; see its header.
 *
 * `AuditContextModule` is not imported because it is `@Global()` and
 * `EffectiveAgreementsReader` resolves `AuditClock` from there — a clock a suite
 * can pin instead of a `new Date()` buried inside the effective-set query.
 *
 * What is **absent** is what keeps this a read. There is no `DatabaseModule`
 * import, so no `TransactionManager` and no executor can be injected: nothing
 * composed here can open a transaction, and a write that needed one could not be
 * added without changing this file. There is no `DesignModule`, so
 * `DESIGN_CASE_REPOSITORY` is out of reach and no route here can send, supersede
 * or record a review on a version — nor open, resume or autosave a Design
 * Session. There is no `ContentModule`, so `AGREEMENT_REPOSITORY` and
 * `PublishApp6AgreementsUseCase` are both unreachable and no request can publish
 * or withdraw a term. There is no `OrderModule`, so `CUSTOM_REQUEST_REPOSITORY`
 * is out of reach and no route can transition a request or move a pointer. There
 * is no `AssetModule` and no `ObjectStorageModule`, so no byte, storage key or
 * provider URL is reachable at all — B10 rasterizes nothing and streams nothing.
 * There is no `AuditModule` and no `OutboxEventStore`, so reading a design
 * cannot append business evidence; there is no grant issuer, no step-up window
 * and no notification module.
 *
 * It exports nothing. There is one entry point and it is the HTTP operation.
 */
@Module({
  imports: [CustomerModule, CustomRequestDesignContextModule, DesignReviewReadModule],
  controllers: [PublicDesignReviewController],
  providers: [ReadCurrentDesignReview],
})
export class CustomerDesignReviewModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { OrderModule } from '../order/order.module';
import { QuotationModule } from './quotation.module';
import { AddQuotationVersionUseCase } from './application/drafting/add-quotation-version.use-case';
import { CreateQuotationDraftUseCase } from './application/drafting/create-quotation-draft.use-case';
import { QuotationVersionDrafter } from './application/drafting/quotation-version.drafter';
import { QuotationDepositPolicyReader } from './infrastructure/policy/quotation-deposit-policy.reader';
import { AdminQuotationController } from './presentation/admin-quotation.controller';

/**
 * `APP6-B01` — the Admin quotation drafting write surface.
 *
 * CTX-QUO's **first** HTTP surface. It is a feature module beside
 * `QuotationModule` rather than an extension of it, following the shape APP5
 * settled on: the context module (`quotation.module.ts`, `order.module.ts`)
 * publishes the aggregate's repository port and stays free of controllers, and
 * each delivered surface composes what it needs around that port. `APP6-B02`'s
 * reads will compose their own module against the same port, which is what keeps
 * a read surface from acquiring a write path by sharing a module with one.
 *
 * Its dependencies are exactly four, and each is a boundary rather than a
 * convenience:
 *
 * - `QuotationModule` — `QUOTATION_REPOSITORY`, the delivered AGG-14 contract.
 *   No second quotation module exists and no persistence is re-implemented here;
 * - `OrderModule` — `CUSTOM_REQUEST_REPOSITORY`, CTX-ORD's own AGG-13 contract,
 *   used for the single `TR-LC12-01` eligibility read. Nothing here writes a
 *   request: the guard needs to know the request reached review, and reading it
 *   through the owning context's published port is how that happens without
 *   touching another module's tables;
 * - `IdentityModule` — the APP1 guards, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `DatabaseModule` — the executor, `TransactionManager` for the drafting
 *   transaction, and `PolicyConfigurationRepository` for the published deposit
 *   share.
 *
 * There is no notification module import, no outbox recorder and no worker
 * dependency. Drafting has no side effect to deliver: `quotation.sent` (SE-004)
 * belongs to the send transaction in `APP6-B03`, and nothing composed here could
 * emit it.
 *
 * It exports nothing. There are two entry points and both are HTTP operations.
 */
@Module({
  imports: [DatabaseModule, IdentityModule, OrderModule, QuotationModule],
  controllers: [AdminQuotationController],
  providers: [
    QuotationDepositPolicyReader,
    QuotationVersionDrafter,
    CreateQuotationDraftUseCase,
    AddQuotationVersionUseCase,
  ],
})
export class QuotationDraftingModule {}

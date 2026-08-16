import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { CustomerModule } from '../customer/customer.module';
import { DesignModule } from '../design/design.module';
import { OrderModule } from './order.module';
import { RequestAssetBinder } from './application/request-asset-binder';
import { RequestSubmissionRecorder } from './application/request-submission.recorder';
import { SubmissionIdentityResolver } from './application/submission-identity.resolver';
import { SubmitCustomRequestUseCase } from './application/submit-custom-request.use-case';
import { PublicCustomRequestController } from './presentation/public-custom-request.controller';

/**
 * `APP5-B01` — the request submission surface.
 *
 * A separate module from `OrderModule` on the `catalog-publication.module.ts`
 * pattern, and for the same reason. `OrderModule` is the CTX-ORD **persistence**
 * module: it holds the AGG-13 and AGG-15 repositories, imports nothing but
 * `DatabaseModule`, and is composed by suites that want those repositories and
 * nothing else. Teaching it about Customer, Design and Asset would make every
 * one of those consumers boot four more contexts to read an order row.
 *
 * The cross-context imports are narrow and each one is a **port or an exported
 * application capability**, never another context's tables:
 *
 * - `CustomerModule` — `ResolveOrCreateVerifiedCustomer` (the only way a
 *   `customers` row is resolved), the verification-challenge port, and
 *   `SecureGrantIssuer`, which `APP4-B05` exported for exactly this caller
 *   rather than publishing an "issue a grant" route;
 * - `DesignModule` — the session and design-case ports, plus the two
 *   presentation primitives that carry APP3's own credential rule
 *   (`AuthorizeDesignSessionService`, `DesignSessionOriginPolicy`);
 * - `AssetModule` — `ASSET_REPOSITORY` only, for the share-locked eligibility
 *   read. Asset keeps owning the asset row; Ordering owns the association;
 * - `DatabaseModule` — `TransactionManager`, `IdempotencyStore` and
 *   `OutboxEventStore`, the platform primitives the W1 transaction is built on.
 *
 * It exports nothing. There is one entry point and it is the HTTP operation.
 */
@Module({
  imports: [DatabaseModule, OrderModule, CustomerModule, DesignModule, AssetModule],
  controllers: [PublicCustomRequestController],
  providers: [
    SubmissionIdentityResolver,
    RequestAssetBinder,
    RequestSubmissionRecorder,
    SubmitCustomRequestUseCase,
  ],
})
export class CustomRequestSubmissionModule {}

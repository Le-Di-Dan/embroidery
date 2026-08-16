import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { AssetModule } from '../asset/asset.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { UploadTimer } from '../asset/application/ports/upload-timer';
import { CustomerModule } from '../customer/customer.module';
import { ChallengeIntakeAuthorizer } from './application/intake/challenge-intake.authorizer';
import { RequestAssetIntakeService } from './application/intake/request-asset-intake.service';
import { RequestAssetStatusService } from './application/intake/request-asset-status.service';
import { RequestIntakeTransactionsService } from './application/intake/request-intake-transactions.service';
import { PublicCustomRequestAssetController } from './presentation/public-custom-request-asset.controller';

/**
 * `APP5-B02` — the pre-submission customer attachment lane.
 *
 * A separate module from `CustomRequestSubmissionModule` on the same pattern
 * that separates `AssetIntakeModule` from `AssetModule`, and for the same
 * reason: this is the only APP5 surface that needs a configured object store,
 * and folding it into the submission module would make every consumer of the
 * `TR-LC11-01` transaction boot storage it never calls.
 *
 * It also has a genuinely different dependency shape. Submission needs Design
 * (sessions, cases) and the grant issuer; intake needs neither — there is no
 * session in this lane and no grant until a request exists. What it needs
 * instead is `ObjectStorageModule`, which submission does not.
 *
 * Every cross-context import is a port or an exported capability:
 *
 * - `CustomerModule` — the verification-challenge port (the credential, and the
 *   row whose lock serializes the quota) and `ResolveOrCreateVerifiedCustomer`,
 *   which is the only way a `customers` row is resolved anywhere;
 * - `AssetModule` — `ASSET_REPOSITORY` only. Asset keeps owning the asset row;
 * - `ObjectStorageModule` — the streamed private write, with no presign
 *   operation on the port to reach for;
 * - `DatabaseModule` — `TransactionManager`, `IdempotencyAllocationStore`,
 *   `IdempotencyStore` (for reading `APP5-B01`'s submission record) and
 *   `OutboxEventStore`;
 * - `AuditContextModule` — `AuditClock`, so intake reads the same clock the
 *   submission transaction does rather than calling `new Date()` in four places.
 *
 * `UploadTimer` is provided here rather than imported: `AssetIntakeModule` does
 * not export it, and it is a stateless scheduling seam, so a second instance is
 * not a second source of truth.
 *
 * It exports nothing. There are two entry points and both are HTTP operations.
 */
@Module({
  imports: [DatabaseModule, AuditContextModule, AssetModule, CustomerModule, ObjectStorageModule],
  controllers: [PublicCustomRequestAssetController],
  providers: [
    UploadTimer,
    ChallengeIntakeAuthorizer,
    RequestIntakeTransactionsService,
    RequestAssetIntakeService,
    RequestAssetStatusService,
  ],
})
export class CustomRequestIntakeModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogModule } from '../catalog/catalog.module';
import { CatalogPlacementReadModule } from '../catalog/catalog-placement-read.module';
import { APPROVAL_SNAPSHOT_REPOSITORY } from './domain/repositories/approval-snapshot.repository';
import { DESIGN_CASE_REPOSITORY } from './domain/repositories/design-case.repository';
import { DESIGN_SESSION_REPOSITORY } from './domain/repositories/design-session.repository';
import { DESIGN_TEMPLATE_REPOSITORY } from './domain/repositories/design-template.repository';
import { DrizzleApprovalSnapshotRepository } from './infrastructure/persistence/drizzle-approval-snapshot.repository';
import { DrizzleDesignCaseRepository } from './infrastructure/persistence/drizzle-design-case.repository';
import { DrizzleDesignSessionRepository } from './infrastructure/persistence/drizzle-design-session.repository';
import { DrizzleDesignTemplateRepository } from './infrastructure/persistence/drizzle-design-template.repository';
import { SlidingWindowRateLimiter } from '../../platform/rate-limit/sliding-window-rate-limiter';
import {
  DESIGN_SESSION_AUTH_CONFIG,
  loadDesignSessionAuthConfig,
  type DesignSessionAuthConfig,
} from './config/design-session-auth.config';
import { AuthorizeDesignSessionService } from './application/authorize-design-session.service';
import { DesignSessionSecretVerifier } from './infrastructure/crypto/design-session-secret.verifier';
import { DesignSessionCookiePolicy } from './infrastructure/http/design-session-cookie.policy';
import { DesignSessionOriginPolicy } from './infrastructure/http/design-session-origin.policy';
import { DesignSessionRateLimiter } from './infrastructure/rate-limit/design-session-rate-limiter';
import { EphemeralNetworkKeyService } from './infrastructure/rate-limit/ephemeral-network-key.service';
import { DesignSessionGuard } from './presentation/guards/design-session.guard';
import { DesignSessionSecretIssuer } from './infrastructure/crypto/design-session-secret.issuer';
import { DesignSessionScopeResolver } from './application/design-session-scope.resolver';
import { DesignDocumentAuthority } from './application/design-document.authority';
import { OpenDesignSessionUseCase } from './application/open-design-session.use-case';
import { ResumeDesignSessionUseCase } from './application/resume-design-session.use-case';
import { PublicDesignSessionController } from './presentation/public-design-session.controller';
import { AssetModule } from '../asset/asset.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { UploadTimer } from '../asset/application/ports/upload-timer';
import { SessionAssetTransactionsService } from './application/session-asset-transactions.service';
import { SessionAssetIntakeService } from './application/session-asset-intake.service';
import { AutosaveDesignSessionUseCase } from './application/autosave-design-session.use-case';
import { SessionDocumentMediaAuthority } from './application/session-document-media.authority';
import { SessionPlacementResolver } from './application/session-placement.authority';
import { PublicDesignSessionAssetController } from './presentation/public-design-session-asset.controller';
import { DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY } from './domain/repositories/design-session-asset-delivery.repository';
import { DrizzleDesignSessionAssetDeliveryRepository } from './infrastructure/persistence/drizzle-design-session-asset-delivery.repository';
import { DesignSessionAssetDeliveryService } from './application/design-session-asset-delivery.service';
import { DesignSessionReadGuard } from './presentation/guards/design-session-read.guard';
import { PublicDesignSessionAssetPreviewController } from './presentation/public-design-session-asset-preview.controller';

/**
 * CTX-DSN — design templates, sessions, cases, versions and approval
 * snapshots (DB7-CP4/CP5).
 *
 * Imports `CatalogModule` for `PLACEMENT_HIERARCHY_PORT` only: the placement
 * chain must be validated before a version, a session or an approval freezes
 * it (G-DB7-13). That is a port, not catalog's repositories, so the module
 * boundary holds.
 */
@Module({
  imports: [
    DatabaseModule,
    CatalogModule,
    CatalogPlacementReadModule,
    // `APP3-B06B` — `AssetModule` for its exported `ASSET_REPOSITORY` **port**,
    // never its tables or its intake internals, and `ObjectStorageModule` for
    // the same `ObjectStoragePort` the Admin lane streams through. Design owns
    // the association and the session; Asset keeps owning the asset row.
    AssetModule,
    ObjectStorageModule,
  ],
  providers: [
    { provide: DESIGN_CASE_REPOSITORY, useClass: DrizzleDesignCaseRepository },
    { provide: APPROVAL_SNAPSHOT_REPOSITORY, useClass: DrizzleApprovalSnapshotRepository },
    { provide: DESIGN_TEMPLATE_REPOSITORY, useClass: DrizzleDesignTemplateRepository },
    { provide: DESIGN_SESSION_REPOSITORY, useClass: DrizzleDesignSessionRepository },
    // `APP3-B06A` — the anonymous Session authorization foundation. Config is a
    // factory so a missing pepper fails when this module is composed, not
    // silently at the first request (`IMP-D043` PO-02).
    {
      provide: DESIGN_SESSION_AUTH_CONFIG,
      useFactory: (): DesignSessionAuthConfig => loadDesignSessionAuthConfig(process.env),
    },
    SlidingWindowRateLimiter,
    EphemeralNetworkKeyService,
    DesignSessionSecretVerifier,
    DesignSessionCookiePolicy,
    DesignSessionOriginPolicy,
    DesignSessionRateLimiter,
    AuthorizeDesignSessionService,
    DesignSessionGuard,
    // APP3-B07 — bootstrap, clone and resume.
    DesignSessionSecretIssuer,
    DesignSessionScopeResolver,
    DesignDocumentAuthority,
    OpenDesignSessionUseCase,
    ResumeDesignSessionUseCase,
    // APP3-B06B — anonymous raster intake.
    UploadTimer,
    SessionAssetTransactionsService,
    SessionAssetIntakeService,
    // APP3-B08 — autosave. The placement resolver reads by id through the
    // placement port `CatalogPlacementReadModule` already exports, and the media
    // authority reads derivatives through the Asset port `AssetModule` exports;
    // neither adds a dependency this module did not already hold.
    SessionPlacementResolver,
    SessionDocumentMediaAuthority,
    AutosaveDesignSessionUseCase,
    // `APP3-B06C` — private Session asset delivery, `IMP-D044` PO-06 class 3.
    // The delivery repository is a **read-only port** with one method: this route
    // resolves through it and never through `DESIGN_SESSION_REPOSITORY`, so no
    // write on that repository is reachable from the GET at all. The read guard
    // is composed from the `APP3-B06A` primitives already provided above and adds
    // no new dependency; the storage port and `AssetModule` were already imported
    // for `APP3-B06B`.
    {
      provide: DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY,
      useClass: DrizzleDesignSessionAssetDeliveryRepository,
    },
    DesignSessionAssetDeliveryService,
    DesignSessionReadGuard,
  ],
  controllers: [
    PublicDesignSessionController,
    PublicDesignSessionAssetController,
    PublicDesignSessionAssetPreviewController,
  ],
  exports: [
    DESIGN_CASE_REPOSITORY,
    APPROVAL_SNAPSHOT_REPOSITORY,
    DESIGN_TEMPLATE_REPOSITORY,
    DESIGN_SESSION_REPOSITORY,
    // The guard *and its whole dependency closure*: a consuming module names the
    // guard in `@UseGuards`, and Nest then instantiates it in that module's
    // scope, where every collaborator must also be resolvable. Exporting the
    // guard alone compiles and fails at boot — which is exactly how `APP3-B07`
    // and `APP3-B06B` would have met it.
    DESIGN_SESSION_AUTH_CONFIG,
    DesignSessionGuard,
    DesignSessionOriginPolicy,
    DesignSessionRateLimiter,
    EphemeralNetworkKeyService,
    AuthorizeDesignSessionService,
    DesignSessionCookiePolicy,
    DesignSessionSecretVerifier,
  ],
})
export class DesignModule {}

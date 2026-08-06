import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CatalogModule } from '../catalog/catalog.module';
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
  imports: [DatabaseModule, CatalogModule],
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

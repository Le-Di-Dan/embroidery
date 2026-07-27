import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { ADMIN_ACCOUNT_REPOSITORY } from './domain/repositories/admin-account.repository';
import { ADMIN_SESSION_REPOSITORY } from './domain/repositories/admin-session.repository';
import { DrizzleAdminAccountRepository } from './infrastructure/persistence/drizzle-admin-account.repository';
import { DrizzleAdminSessionRepository } from './infrastructure/persistence/drizzle-admin-session.repository';
import { STAFF_AUTH_CONFIG, loadStaffAuthConfig } from './config/staff-auth.config';
import { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-password-hasher';
import { SessionTokenService } from './infrastructure/crypto/session-token.service';
import { LoginRateLimiter } from './infrastructure/rate-limit/login-rate-limiter';
import { CookiePolicyService } from './infrastructure/http/cookie-policy.service';
import { RequestOriginPolicy } from './infrastructure/http/request-origin.policy';
import { StaffClock } from './application/ports/staff-clock';
import { StaffAuditWriter } from './application/staff-audit.writer';
import { AuthenticateStaffUseCase } from './application/authenticate-staff.use-case';
import { RevokeStaffSessionUseCase } from './application/revoke-staff-session.use-case';
import { ResolveStaffSessionService } from './application/resolve-staff-session.service';
import { StaffAccountStatusService } from './application/staff-account-status.service';
import { BootstrapStaffUseCase } from './application/bootstrap-staff.use-case';
import { GetCurrentStaffQuery } from './application/get-current-staff.query';
import { AuthenticatedAdminGuard } from './presentation/guards/authenticated-admin.guard';
import { StaffOriginGuard } from './presentation/guards/staff-origin.guard';
import { StaffJsonBodyGuard } from './presentation/guards/staff-json-body.guard';
import { StaffSessionController } from './presentation/staff-session.controller';
import { StaffSelfController } from './presentation/staff-self.controller';

/**
 * CTX-IDN — admin identity, staff authentication and revocable sessions
 * (DB7 persistence + APP1-B01 auth). Repositories bind to their domain tokens so
 * consumers depend on the interface, not the Drizzle class
 * (`BACKEND_CONVENTIONS.md` §10). The guard, session resolver and cookie policy
 * are exported for APP1-B02 (`GET /api/staff/me`) to reuse without redefining
 * the auth foundation.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [StaffSessionController, StaffSelfController],
  providers: [
    { provide: ADMIN_ACCOUNT_REPOSITORY, useClass: DrizzleAdminAccountRepository },
    { provide: ADMIN_SESSION_REPOSITORY, useClass: DrizzleAdminSessionRepository },
    { provide: STAFF_AUTH_CONFIG, useFactory: () => loadStaffAuthConfig(process.env) },
    StaffClock,
    ScryptPasswordHasher,
    SessionTokenService,
    LoginRateLimiter,
    CookiePolicyService,
    RequestOriginPolicy,
    StaffAuditWriter,
    AuthenticateStaffUseCase,
    RevokeStaffSessionUseCase,
    ResolveStaffSessionService,
    StaffAccountStatusService,
    BootstrapStaffUseCase,
    GetCurrentStaffQuery,
    AuthenticatedAdminGuard,
    StaffOriginGuard,
    StaffJsonBodyGuard,
  ],
  exports: [
    ADMIN_ACCOUNT_REPOSITORY,
    ADMIN_SESSION_REPOSITORY,
    STAFF_AUTH_CONFIG,
    ScryptPasswordHasher,
    ResolveStaffSessionService,
    StaffAccountStatusService,
    BootstrapStaffUseCase,
    StaffAuditWriter,
    CookiePolicyService,
    AuthenticatedAdminGuard,
    // APP2-B01 reuses the exact Origin allowlist on the Admin upload route.
    StaffOriginGuard,
    RequestOriginPolicy,
  ],
})
export class IdentityModule {}

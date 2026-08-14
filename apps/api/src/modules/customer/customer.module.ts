import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { CustomerIdentityAuditRecorder } from './application/customer-identity-audit.recorder';
import { IssueVerificationChallengeUseCase } from './application/issue-verification-challenge.use-case';
import { ResendVerificationChallengeUseCase } from './application/resend-verification-challenge.use-case';
import { ResolveOrCreateVerifiedCustomer } from './application/resolve-or-create-verified-customer.service';
import { VerificationChallengeIssuer } from './application/verification-challenge.issuer';
import { App4SecretPepperProvider } from './config/app4-secret-pepper.provider';
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository';
import { SECURE_ACCESS_GRANT_REPOSITORY } from './domain/repositories/secure-access-grant.repository';
import { VERIFICATION_CHALLENGE_REPOSITORY } from './domain/repositories/verification-challenge.repository';
import { VerificationClock } from './infrastructure/clock/verification-clock';
import { VerificationCodeMinter } from './infrastructure/crypto/verification-code.minter';
import { DrizzleCustomerRepository } from './infrastructure/persistence/drizzle-customer.repository';
import { DrizzleSecureAccessGrantRepository } from './infrastructure/persistence/drizzle-secure-access-grant.repository';
import { DrizzleVerificationChallengeRepository } from './infrastructure/persistence/drizzle-verification-challenge.repository';
import { VerificationPolicyReader } from './infrastructure/policy/verification-policy.reader';
import { PublicVerificationController } from './presentation/public-verification.controller';

/**
 * CTX-CUS — customer identity, contact verification and secure access grants
 * (DB7-CP3).
 *
 * `DB2_BOUNDED_CONTEXT_MAP.md` places AGG-02, AGG-03 and AGG-04 in one context:
 * they share the customer's identity lifecycle and the verification flow that
 * creates it.
 *
 * `APP4-B02` added the application layer over the identity half and composed the
 * module into `AppModule`. It has no route, and that is the point: a customer
 * exists only as a side effect of a successful verification (`ADR-DB2-001`
 * Option A), so `ResolveOrCreateVerifiedCustomer` is exported for `APP4-B04` to
 * call inside its own transaction rather than exposed as a create-customer
 * endpoint.
 *
 * `APP4-B03` adds the module's **first controller** — the two anonymous
 * challenge operations. They are the front of that same flow: a code goes out
 * here, B04 accepts the answer, and only then does the identity half above run.
 *
 * The one new import is what those operations need and nothing more:
 * `NotificationModule` supplies `RequestNotificationUseCase`, the single seam
 * that seals a delivery envelope — B03 hands it the raw code and never seals
 * itself. The peppers arrive through `App4SecretPepperProvider`, which validates
 * lazily rather than in a factory, for the reason recorded on that class.
 */
@Module({
  imports: [DatabaseModule, AuditModule, NotificationModule],
  controllers: [PublicVerificationController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: DrizzleCustomerRepository },
    CustomerIdentityAuditRecorder,
    ResolveOrCreateVerifiedCustomer,
    {
      provide: VERIFICATION_CHALLENGE_REPOSITORY,
      useClass: DrizzleVerificationChallengeRepository,
    },
    { provide: SECURE_ACCESS_GRANT_REPOSITORY, useClass: DrizzleSecureAccessGrantRepository },
    App4SecretPepperProvider,
    VerificationClock,
    VerificationCodeMinter,
    VerificationPolicyReader,
    VerificationChallengeIssuer,
    IssueVerificationChallengeUseCase,
    ResendVerificationChallengeUseCase,
  ],
  // The application capabilities are exported; the recorder, the clock, the
  // minter and the policy reader are not — they are this module's own machinery,
  // not services other contexts call.
  exports: [
    CUSTOMER_REPOSITORY,
    VERIFICATION_CHALLENGE_REPOSITORY,
    SECURE_ACCESS_GRANT_REPOSITORY,
    ResolveOrCreateVerifiedCustomer,
  ],
})
export class CustomerModule {}

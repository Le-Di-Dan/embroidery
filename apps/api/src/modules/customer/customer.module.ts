import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { CustomerIdentityAuditRecorder } from './application/customer-identity-audit.recorder';
import { IssueVerificationChallengeUseCase } from './application/issue-verification-challenge.use-case';
import { ReadVerificationChallengeStatus } from './application/read-verification-challenge-status.query';
import { ResendVerificationChallengeUseCase } from './application/resend-verification-challenge.use-case';
import { ResolveOrCreateVerifiedCustomer } from './application/resolve-or-create-verified-customer.service';
import { SecureGrantAuditRecorder } from './application/secure-grant-audit.recorder';
import { SecureGrantIssuer } from './application/secure-grant.issuer';
import { SecureGrantNotifier } from './application/secure-grant.notifier';
import { StepUpWindow } from './application/step-up-window.service';
import { SubmitVerificationAttemptUseCase } from './application/submit-verification-attempt.use-case';
import { VerificationChallengeIssuer } from './application/verification-challenge.issuer';
import { VerificationOutcomeAuditRecorder } from './application/verification-outcome-audit.recorder';
import { App4SecretPepperProvider } from './config/app4-secret-pepper.provider';
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository';
import { SECURE_ACCESS_GRANT_REPOSITORY } from './domain/repositories/secure-access-grant.repository';
import { VERIFICATION_CHALLENGE_REPOSITORY } from './domain/repositories/verification-challenge.repository';
import { VerificationClock } from './infrastructure/clock/verification-clock';
import { VerificationCodeMinter } from './infrastructure/crypto/verification-code.minter';
import { DrizzleCustomerRepository } from './infrastructure/persistence/drizzle-customer.repository';
import { DrizzleSecureAccessGrantRepository } from './infrastructure/persistence/drizzle-secure-access-grant.repository';
import { DrizzleVerificationChallengeRepository } from './infrastructure/persistence/drizzle-verification-challenge.repository';
import { SecureGrantPolicyReader } from './infrastructure/policy/secure-grant-policy.reader';
import { SecureLinkTokenMinter } from './infrastructure/crypto/secure-link-token.minter';
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
 * `APP4-B04` closes that loop on the same controller: submitting an answer and
 * reading a challenge's state. It needs no new import — the identity service it
 * calls for a `SUBMISSION` is this module's own, and the audit repository is
 * already here for `CustomerIdentityAuditRecorder`. `VerificationOutcomeAuditRecorder`
 * stays unexported for the same reason the identity recorder is: it is this
 * module's machinery, not a service another context calls.
 *
 * The one new import is what those operations need and nothing more:
 * `NotificationModule` supplies `RequestNotificationUseCase`, the single seam
 * that seals a delivery envelope — B03 hands it the raw code and never seals
 * itself. The peppers arrive through `App4SecretPepperProvider`, which validates
 * lazily rather than in a factory, for the reason recorded on that class.
 *
 * `APP4-B05` adds the AGG-04 half — grant issue, reissue, revoke and the step-up
 * window — and adds **no controller**. That is the checkpoint's defining
 * property: an "issue a grant" route would be a way to mint a customer's only
 * credential for a request from outside any authorized business action
 * (`APP4_PHASE_ENTRY_AUDIT` §C.2). The capabilities are exported for the
 * in-process callers that will own those actions instead. It needs no new
 * import: the grant repository, the audit repository, the notification seam and
 * the peppers were all already here.
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
    VerificationOutcomeAuditRecorder,
    SubmitVerificationAttemptUseCase,
    ReadVerificationChallengeStatus,
    SecureGrantPolicyReader,
    SecureLinkTokenMinter,
    SecureGrantAuditRecorder,
    SecureGrantNotifier,
    SecureGrantIssuer,
    StepUpWindow,
  ],
  // The application capabilities are exported; the recorder, the clock, the
  // minter and the policy reader are not — they are this module's own machinery,
  // not services other contexts call.
  exports: [
    CUSTOMER_REPOSITORY,
    VERIFICATION_CHALLENGE_REPOSITORY,
    SECURE_ACCESS_GRANT_REPOSITORY,
    ResolveOrCreateVerifiedCustomer,
    // `APP4-B05`'s two internal capabilities. A future APP5 submission calls
    // `SecureGrantIssuer.issue` and an APP6/APP7 sensitive action asks
    // `StepUpWindow` — neither composes a token issuer, a repository and a
    // notification use case itself (§18). The recorder, the notifier, the
    // minter and the policy reader stay unexported: they are this module's own
    // machinery, and a caller that could reach the notifier could deliver a
    // token without a grant.
    SecureGrantIssuer,
    StepUpWindow,
  ],
})
export class CustomerModule {}

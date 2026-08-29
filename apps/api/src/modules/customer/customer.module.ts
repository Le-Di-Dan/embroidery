import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { SlidingWindowRateLimiter } from '../../platform/rate-limit/sliding-window-rate-limiter';

import { AssetCustomerOwnershipTransferModule } from '../asset/customer-ownership-transfer.module';
import { AssetMergeConsequenceModule } from '../asset/customer-merge-consequence.module';
import { AuditModule } from '../audit/audit.module';
import { CustomerMergeConsequenceModule } from '../order/customer-merge-consequence.module';
import { CustomerOwnershipTransferModule } from '../order/customer-ownership-transfer.module';
import { NotificationModule } from '../notification/notification.module';
import { CustomerIdentityAuditRecorder } from './application/customer-identity-audit.recorder';
import { CustomerMaintenanceAuditRecorder } from './application/customer-maintenance-audit.recorder';
import { CustomerMergeAuditRecorder } from './application/customer-merge-audit.recorder';
import { CustomerMergeCaseQuery } from './application/customer-merge-case.query';
import { MergeConsequencePreviewReader } from './application/customer-merge-consequence.preview';
import { CustomerMergeTransfer } from './application/customer-merge-transfer.service';
import { ExecuteCustomerMerge } from './application/execute-customer-merge.use-case';
import { OpenCustomerMergeCase } from './application/open-customer-merge-case.use-case';
import { RejectCustomerMergeCase } from './application/reject-customer-merge-case.use-case';
import { MaintainCustomerContact } from './application/maintain-customer-contact.use-case';
import { MaintainCustomerProfile } from './application/maintain-customer-profile.use-case';
import { IssueVerificationChallengeUseCase } from './application/issue-verification-challenge.use-case';
import { ReadVerificationChallengeStatus } from './application/read-verification-challenge-status.query';
import { ResendVerificationChallengeUseCase } from './application/resend-verification-challenge.use-case';
import { ResolveOrCreateVerifiedCustomer } from './application/resolve-or-create-verified-customer.service';
import { AuthorizeSecureLink } from './application/authorize-secure-link.service';
import { ReauthorizeSecureGrant } from './application/reauthorize-secure-grant.service';
import { ResolveSecureLink } from './application/resolve-secure-link.query';
import { SecureLinkAuditRecorder } from './application/secure-link-audit.recorder';
import { SecureGrantAuditRecorder } from './application/secure-grant-audit.recorder';
import { SecureGrantIssuer } from './application/secure-grant.issuer';
import { SecureGrantNotifier } from './application/secure-grant.notifier';
import { StepUpEvidenceResolver } from './application/step-up-evidence.resolver';
import { StepUpWindow } from './application/step-up-window.service';
import { SubmitVerificationAttemptUseCase } from './application/submit-verification-attempt.use-case';
import { VerificationChallengeIssuer } from './application/verification-challenge.issuer';
import { VerificationOutcomeAuditRecorder } from './application/verification-outcome-audit.recorder';
import { App4SecretPepperProvider } from './config/app4-secret-pepper.provider';
import { ADMIN_CUSTOMER_SUMMARY_PORT } from './domain/repositories/admin-customer-summary.port';
import { CUSTOMER_MERGE_CASE_REPOSITORY } from './domain/repositories/customer-merge-case.repository';
import { CUSTOMER_MERGE_EVENT_REPOSITORY } from './domain/repositories/customer-merge-event.repository';
import { CUSTOMER_MERGE_EXECUTION_PORT } from './domain/repositories/customer-merge-execution.port';
import { CUSTOMER_MERGE_PREVIEW_PORT } from './domain/repositories/customer-merge-preview.port';
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository';
import { SECURE_ACCESS_GRANT_REPOSITORY } from './domain/repositories/secure-access-grant.repository';
import { VERIFICATION_CHALLENGE_REPOSITORY } from './domain/repositories/verification-challenge.repository';
import { VerificationClock } from './infrastructure/clock/verification-clock';
import { VerificationCodeMinter } from './infrastructure/crypto/verification-code.minter';
import { DrizzleAdminCustomerSummaryAdapter } from './infrastructure/persistence/drizzle-admin-customer-summary.adapter';
import { DrizzleCustomerMergeCaseRepository } from './infrastructure/persistence/drizzle-customer-merge-case.repository';
import { DrizzleCustomerMergeEventRepository } from './infrastructure/persistence/drizzle-customer-merge-event.repository';
import { DrizzleCustomerMergeExecutionAdapter } from './infrastructure/persistence/drizzle-customer-merge-execution.adapter';
import { DrizzleCustomerMergePreviewAdapter } from './infrastructure/persistence/drizzle-customer-merge-preview.adapter';
import { DrizzleCustomerRepository } from './infrastructure/persistence/drizzle-customer.repository';
import { DrizzleSecureAccessGrantRepository } from './infrastructure/persistence/drizzle-secure-access-grant.repository';
import { DrizzleVerificationChallengeRepository } from './infrastructure/persistence/drizzle-verification-challenge.repository';
import { SecureGrantPolicyReader } from './infrastructure/policy/secure-grant-policy.reader';
import { SecureLinkPolicyReader } from './infrastructure/policy/secure-link-policy.reader';
import { SecureLinkTokenMinter } from './infrastructure/crypto/secure-link-token.minter';
import { PublicNetworkKeyService } from './infrastructure/rate-limit/public-network-key.service';
import { SecureLinkRateLimiter } from './infrastructure/rate-limit/secure-link-rate-limiter';
import { VerificationPolicyReader } from './infrastructure/policy/verification-policy.reader';
import { PublicSecureLinkController } from './presentation/public-secure-link.controller';
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
 *
 * `APP4-B06` adds the module's **second controller** and the phase's single
 * highest-risk public surface: one anonymous POST that exchanges an opaque
 * secure-link token for the request it opens. It is a separate class from the
 * verification controller because the route prefix differs and Nest derives an
 * `operationId` from the class name — folding it in would have renamed four
 * accepted operations. It reads the same grant repository B05 writes, through a
 * narrow read-only addition, and shares nothing else with it.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    NotificationModule,
    // `APP10-B02`. Two count-only read ports, each implemented by the context
    // that owns the table, so the merge consequence preview never reads another
    // module's tables (`CLAUDE.md` §5). Neither module exports a repository, a
    // transaction manager or a write of any kind — importing them confers two
    // counting methods and nothing else.
    CustomerMergeConsequenceModule,
    AssetMergeConsequenceModule,
    // `APP10-B03`. The two write seams, deliberately separate modules from the
    // count-only ones above: a merge repoints rows Ordering and Asset own, and
    // Customer must not reach their tables (`CLAUDE.md` §5). Each exports one
    // port with one method, each implementation joins **this** transaction
    // through the ambient handle, and neither confers a repository, a lifecycle
    // write or a transaction manager.
    CustomerOwnershipTransferModule,
    AssetCustomerOwnershipTransferModule,
  ],
  controllers: [PublicVerificationController, PublicSecureLinkController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: DrizzleCustomerRepository },
    // `APP5-B04`. A read-only projection port, bound here because Customer owns
    // the tables behind it; the Admin request surface consumes the interface and
    // never `CUSTOMER_REPOSITORY`, whose rows carry unmasked contact values.
    { provide: ADMIN_CUSTOMER_SUMMARY_PORT, useClass: DrizzleAdminCustomerSummaryAdapter },
    CustomerIdentityAuditRecorder,
    ResolveOrCreateVerifiedCustomer,
    // `APP10-B01`. The maintenance capabilities live here, beside the repository
    // and the audit seam they need, and are exported for the Admin surface to
    // call. The recorder stays unexported, on this module's standing rule: a
    // consuming context receives the capability, never the machinery.
    CustomerMaintenanceAuditRecorder,
    MaintainCustomerProfile,
    MaintainCustomerContact,
    // `APP10-B02`. The merge case lifecycle and its consequence preview, bound
    // here beside the customer repository and the audit seam they need. The two
    // ports are separate from `CUSTOMER_REPOSITORY` on the rule
    // `admin-customer-summary.port.ts` records: a merge case is a workflow row
    // about two customers, and the preview holds counts rather than the contact
    // rows a wide contract would have returned. Nothing bound here can execute a
    // merge — that transaction is `APP10-B03`'s.
    { provide: CUSTOMER_MERGE_CASE_REPOSITORY, useClass: DrizzleCustomerMergeCaseRepository },
    { provide: CUSTOMER_MERGE_PREVIEW_PORT, useClass: DrizzleCustomerMergePreviewAdapter },
    CustomerMergeAuditRecorder,
    MergeConsequencePreviewReader,
    OpenCustomerMergeCase,
    CustomerMergeCaseQuery,
    RejectCustomerMergeCase,
    // `APP10-B03`. The execution half: two more ports and the one transaction
    // that performs a merge. They are bound here rather than in the Admin
    // support module for the reason the lifecycle half is — one instance of
    // each adapter, beside the customer repository, the grant repository and the
    // audit seam the merge writes through. The event repository can only
    // append; the execution port is the only thing in this module that can
    // write `merged_into_customer_id`.
    { provide: CUSTOMER_MERGE_EXECUTION_PORT, useClass: DrizzleCustomerMergeExecutionAdapter },
    { provide: CUSTOMER_MERGE_EVENT_REPOSITORY, useClass: DrizzleCustomerMergeEventRepository },
    CustomerMergeTransfer,
    ExecuteCustomerMerge,
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
    // `APP6-B05`. GRD-003's *evidence*, beside the boolean window: a sensitive
    // write records the challenge it was authorized by, so it needs the row.
    StepUpEvidenceResolver,
    // `APP4-B06`. The limiter's algorithm is the platform's, provided here so
    // this module owns its own counters — the same shape `DesignModule` uses.
    SlidingWindowRateLimiter,
    SecureLinkRateLimiter,
    PublicNetworkKeyService,
    SecureLinkPolicyReader,
    SecureLinkAuditRecorder,
    ResolveSecureLink,
    // `APP5-B03`. Composes the three above in the one order that makes them a
    // security model, so a second public token surface cannot re-derive it.
    AuthorizeSecureLink,
    // `APP6-B05`. The in-transaction half of the same model — see the class.
    ReauthorizeSecureGrant,
  ],
  // The application capabilities are exported; the recorder, the clock, the
  // minter and the policy reader are not — they are this module's own machinery,
  // not services other contexts call.
  exports: [
    CUSTOMER_REPOSITORY,
    // `APP5-B04`'s narrow Admin projection. Exported as the port symbol, so a
    // consumer receives masked contacts and nothing it could unmask.
    ADMIN_CUSTOMER_SUMMARY_PORT,
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
    // `APP6-B05`'s two additions, on the same rule: a consuming context receives
    // the capability, never the machinery. `StepUpEvidenceResolver` composes the
    // customer's contacts, the challenge history and the published window;
    // `ReauthorizeSecureGrant` composes the pepper, the digest and the locking
    // resolver. Neither exposes a pepper, a digest, a raw contact value or the
    // grant repository's write methods, and a caller holding either cannot mint,
    // revoke or re-scope anything.
    StepUpEvidenceResolver,
    // `APP4-B06`'s public admission, exported for `APP5-B03` on the same rule:
    // a consuming context receives the capability, never the machinery. The
    // policy reader, the limiter, the network-key service and the resolver stay
    // unexported — a caller holding the resolver alone could skip the
    // fail-closed policy read and the abuse budget.
    AuthorizeSecureLink,
    ReauthorizeSecureGrant,
    // `APP10-B01`'s two Admin maintenance capabilities. Exported rather than
    // re-provided beside the controllers, so there is one instance of each and
    // the audit recorder they write through cannot be duplicated by a second
    // module composing its own.
    MaintainCustomerProfile,
    MaintainCustomerContact,
    // `APP10-B02`'s three merge lifecycle capabilities, on the same rule: the
    // Admin surface receives the capability, never the machinery. The two merge
    // ports, the recorder and the preview reader stay unexported — a caller
    // holding the case repository could write a `REJECTED` row with no audit
    // event beside it.
    OpenCustomerMergeCase,
    CustomerMergeCaseQuery,
    RejectCustomerMergeCase,
    // `APP10-B03`, on the same rule. The transfer service, the execution port
    // and the event repository stay unexported: a caller holding any of the
    // three could move a customer’s orders, revoke their links or append merge
    // history without the case transition and the audit row that make it a
    // merge rather than a data edit.
    ExecuteCustomerMerge,
  ],
})
export class CustomerModule {}

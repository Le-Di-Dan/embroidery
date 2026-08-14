import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditModule } from '../audit/audit.module';
import { CustomerIdentityAuditRecorder } from './application/customer-identity-audit.recorder';
import { ResolveOrCreateVerifiedCustomer } from './application/resolve-or-create-verified-customer.service';
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository';
import { SECURE_ACCESS_GRANT_REPOSITORY } from './domain/repositories/secure-access-grant.repository';
import { VERIFICATION_CHALLENGE_REPOSITORY } from './domain/repositories/verification-challenge.repository';
import { DrizzleCustomerRepository } from './infrastructure/persistence/drizzle-customer.repository';
import { DrizzleSecureAccessGrantRepository } from './infrastructure/persistence/drizzle-secure-access-grant.repository';
import { DrizzleVerificationChallengeRepository } from './infrastructure/persistence/drizzle-verification-challenge.repository';

/**
 * CTX-CUS — customer identity, contact verification and secure access grants
 * (DB7-CP3).
 *
 * `DB2_BOUNDED_CONTEXT_MAP.md` places AGG-02, AGG-03 and AGG-04 in one context:
 * they share the customer's identity lifecycle and the verification flow that
 * creates it.
 *
 * `APP4-B02` adds the application layer over the identity half and composes the
 * module into `AppModule` for the first time. It has **no controller and no
 * route**, and that is the point: a customer exists only as a side effect of a
 * successful verification (`ADR-DB2-001` Option A), so the capability is exported
 * for `APP4-B04` to call inside its own transaction rather than exposed as a
 * create-customer endpoint. `AuditModule` is imported because every identity
 * link is audited evidence (`INV-14`, r5); the request and audit *contexts* are
 * global platform modules and need no import.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: DrizzleCustomerRepository },
    CustomerIdentityAuditRecorder,
    ResolveOrCreateVerifiedCustomer,
    {
      provide: VERIFICATION_CHALLENGE_REPOSITORY,
      useClass: DrizzleVerificationChallengeRepository,
    },
    { provide: SECURE_ACCESS_GRANT_REPOSITORY, useClass: DrizzleSecureAccessGrantRepository },
  ],
  // The application capability is exported; the recorder is not — it is this
  // module's own way of writing evidence, not a service other contexts call.
  exports: [
    CUSTOMER_REPOSITORY,
    VERIFICATION_CHALLENGE_REPOSITORY,
    SECURE_ACCESS_GRANT_REPOSITORY,
    ResolveOrCreateVerifiedCustomer,
  ],
})
export class CustomerModule {}

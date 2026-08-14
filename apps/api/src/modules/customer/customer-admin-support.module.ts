import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { CustomerModule } from './customer.module';
import { AdminCustomerSupportQuery } from './application/admin-customer-support.query';
import { RevokeSecureGrantUseCase } from './application/revoke-secure-grant.use-case';
import { AdminCustomerSupportController } from './presentation/admin-customer-support.controller';
import { AdminSecureGrantController } from './presentation/admin-secure-grant.controller';

/**
 * The Admin Customer and secure-grant support surface (`APP4-B07`).
 *
 * A **separate module** from `CustomerModule`, for the reason
 * `DesignTemplateAdminModule` is separate from `DesignModule`: `CustomerModule`
 * is the anonymous public stack — verification challenges and secure-link
 * resolution, served to callers with no identity at all — and it deliberately
 * holds no staff-auth dependency. Folding three authenticated Admin routes in
 * there would put `IdentityModule`, its cookie policy and its session repository
 * into the module that answers anonymous customers, and would make
 * `AuthenticatedAdminGuard` resolvable from a controller that must never use it.
 *
 * It also keeps `APP4-B05`'s accepted composition intact: that checkpoint's gate
 * asserts `customer.module.ts` registers no grant controller, and it still
 * registers none.
 *
 * ### What it imports, and why nothing else
 *
 * - `IdentityModule` — for the three APP1 guards, and for nothing else. No
 *   session is read here, no cookie parsed, no admin account queried.
 * - `CustomerModule` — for the two repository ports and `SecureGrantIssuer`,
 *   all three already exported. The issuer is imported rather than re-provided:
 *   B05 owns the grant lifecycle, and a second instance built from a locally
 *   bound repository would be a second lifecycle owner with its own audit path.
 *
 * There is no `AuditModule` import, and that absence is deliberate. B07 appends
 * no audit event of its own — the revocation's evidence is written inside
 * `SecureGrantIssuer.revoke`, in the same transaction as the transition, from
 * the Admin actor this module's use case resolves. A direct audit dependency
 * here would be the seam through which a second, compensating evidence row got
 * written beside B05's.
 *
 * No repository provider is bound in this module. Both ports resolve to the
 * single implementations `CustomerModule` provides, so there is one adapter per
 * contract and the Admin surface cannot drift from the flow it reports on.
 */
@Module({
  imports: [IdentityModule, CustomerModule],
  controllers: [AdminCustomerSupportController, AdminSecureGrantController],
  providers: [AdminCustomerSupportQuery, RevokeSecureGrantUseCase],
})
export class CustomerAdminSupportModule {}

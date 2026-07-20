import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { DEPOSIT_ELIGIBILITY_PORT } from './domain/repositories/deposit-eligibility.port';
import { PAYMENT_OBLIGATION_REPOSITORY } from './domain/repositories/payment-obligation.repository';
import { DrizzleDepositEligibilityAdapter } from './infrastructure/persistence/drizzle-deposit-eligibility.adapter';
import { DrizzlePaymentObligationRepository } from './infrastructure/persistence/drizzle-payment-obligation.repository';
import { PaymentEvidenceRepository } from './infrastructure/persistence/payment-evidence.repository';

/**
 * CTX-PAY — obligations, attempts, provider callbacks, reconciliation and
 * refunds (DB7-CP4).
 *
 * Exports `DEPOSIT_ELIGIBILITY_PORT` so Inventory can gate an official
 * reservation on deposit satisfaction (G-DB7-27) without importing this
 * module's repository or reading its tables (`BACKEND_CONVENTIONS.md` §10).
 *
 * DB7 implements the persistence and its guards. Concurrent-callback races
 * are DB8 CC-07/08.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    PaymentEvidenceRepository,
    { provide: PAYMENT_OBLIGATION_REPOSITORY, useClass: DrizzlePaymentObligationRepository },
    { provide: DEPOSIT_ELIGIBILITY_PORT, useClass: DrizzleDepositEligibilityAdapter },
  ],
  exports: [PAYMENT_OBLIGATION_REPOSITORY, DEPOSIT_ELIGIBILITY_PORT],
})
export class PaymentModule {}

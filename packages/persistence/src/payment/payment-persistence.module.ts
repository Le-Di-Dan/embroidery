/**
 * The one composition root for AGG-16 Payment persistence (`APP7-W01-C1`).
 *
 * Here for the same reason `OrderPersistenceModule` is, and settled by the same
 * rule: `APP7-W01` §6 permits a worker-local seam only for facts the canonical
 * repositories do **not** already own. `createForOrder` owns obligation
 * creation, and the worker had been inserting `payment_obligations` with SQL of
 * its own — the identical defect one aggregate over from the one the correction
 * names. Two writers of the DEPOSIT/REMAINING pair could drift on currency, on
 * the initial state, or on which quotation version an amount is attributed to.
 *
 * ```text
 * apps/api    PaymentModule          imports PaymentPersistenceModule
 * apps/worker OrderConversionModule  imports PaymentPersistenceModule
 * ```
 *
 * `DEPOSIT_ELIGIBILITY_PORT` is exported unchanged, so Inventory still gates an
 * official reservation on deposit satisfaction (G-DB7-27) without importing this
 * module's repository or reading its tables.
 *
 * Nothing about payment *behaviour* moved with the files: the attempt lifecycle,
 * `satisfy`'s G-DB7-06/33 re-reads, provider-event idempotency, reconciliation
 * and the refund ceiling are exactly as DB7 delivered them. APP7 still creates
 * no attempt.
 */
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { DEPOSIT_ELIGIBILITY_PORT } from './deposit-eligibility.port';
import { DrizzleDepositEligibilityAdapter } from './drizzle-deposit-eligibility.adapter';
import { DrizzlePaymentObligationRepository } from './drizzle-payment-obligation.repository';
import { PaymentAttemptRepository } from './payment-attempt.repository';
import { PaymentEvidenceRepository } from './payment-evidence.repository';
import { PaymentTransferEvidenceRepository } from './payment-transfer-evidence.repository';
import { PAYMENT_OBLIGATION_REPOSITORY } from './payment-obligation.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    PaymentAttemptRepository,
    PaymentEvidenceRepository,
    PaymentTransferEvidenceRepository,
    { provide: PAYMENT_OBLIGATION_REPOSITORY, useClass: DrizzlePaymentObligationRepository },
    { provide: DEPOSIT_ELIGIBILITY_PORT, useClass: DrizzleDepositEligibilityAdapter },
  ],
  exports: [
    PAYMENT_OBLIGATION_REPOSITORY,
    DEPOSIT_ELIGIBILITY_PORT,
    // APP7-B05. The one canonical writer of `payment_transfer_evidence`,
    // exported as the class because it has no port: it is CTX-PAY persistence
    // consumed by CTX-PAY surfaces, and `APP7-B06` will list through this same
    // instance rather than growing a second reader.
    PaymentTransferEvidenceRepository,
  ],
})
export class PaymentPersistenceModule {}

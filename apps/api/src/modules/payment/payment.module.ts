import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PAYMENT_OBLIGATION_REPOSITORY } from './domain/repositories/payment-obligation.repository';
import { DrizzlePaymentObligationRepository } from './infrastructure/persistence/drizzle-payment-obligation.repository';
import { PaymentEvidenceRepository } from './infrastructure/persistence/payment-evidence.repository';

/**
 * CTX-PAY — obligations, attempts, provider callbacks, reconciliation and
 * refunds (DB7-CP4).
 *
 * DB7 implements the persistence and its guards. Concurrent-callback races
 * are DB8 CC-07/08.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    PaymentEvidenceRepository,
    { provide: PAYMENT_OBLIGATION_REPOSITORY, useClass: DrizzlePaymentObligationRepository },
  ],
  exports: [PAYMENT_OBLIGATION_REPOSITORY],
})
export class PaymentModule {}

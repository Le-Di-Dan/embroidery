import { Module } from '@nestjs/common';
import { DatabaseModule, PaymentPersistenceModule } from '@embroidery/persistence';

/**
 * CTX-PAY — obligations, attempts, provider callbacks, reconciliation and
 * refunds (DB7-CP4).
 *
 * Exports `DEPOSIT_ELIGIBILITY_PORT` so Inventory can gate an official
 * reservation on deposit satisfaction (G-DB7-27) without importing this
 * module's repository or reading its tables (`BACKEND_CONVENTIONS.md` §10).
 *
 * The implementation moved to `@embroidery/persistence` in `APP7-W01-C1`: the
 * worker creates the DEPOSIT and REMAINING pair inside the order-conversion
 * transaction, and a second writer of that pair could drift from this one on
 * currency, initial state or which quotation version an amount is attributed
 * to. This module imports the one implementation and re-exports both tokens, so
 * every API consumer resolves exactly what it did before.
 *
 * DB7 implements the persistence and its guards. Concurrent-callback races
 * are DB8 CC-07/08.
 */
@Module({
  imports: [DatabaseModule, PaymentPersistenceModule],
  // The module, not the tokens: Nest re-exports what it imports. Inventory and
  // every other consumer of `PaymentModule` resolve both tokens unchanged.
  exports: [PaymentPersistenceModule],
})
export class PaymentModule {}

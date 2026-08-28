import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ORDERING_MERGE_CONSEQUENCE_PORT } from './domain/repositories/customer-merge-consequence.port';
import { DrizzleCustomerMergeConsequenceAdapter } from './infrastructure/persistence/drizzle-customer-merge-consequence.adapter';

/**
 * Ordering's customer-reference counts, published on their own
 * (`APP10-B02` §13).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `OrderDepositContextModule` and `CustomRequestStatusModule` set:
 * Ordering publishes narrow contracts and a consumer imports the one it is
 * allowed to hold, never the aggregate that contains it.
 *
 * It exists rather than adding the provider to `OrderModule` because that
 * module exports `CUSTOM_REQUEST_REPOSITORY` and `ORDER_REPOSITORY` — the
 * AGG-13 and AGG-15 **write** contracts. An Admin merge surface that imported
 * it to count two tables would gain `transition()` and `dispatch()` in the same
 * injector, which is exactly the reach a non-destructive preview must not have.
 *
 * It declares no controller, so it publishes no route, and `DatabaseModule` is
 * imported for the adapter's executor and not re-exported: importing this
 * module confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: ORDERING_MERGE_CONSEQUENCE_PORT, useClass: DrizzleCustomerMergeConsequenceAdapter },
  ],
  exports: [ORDERING_MERGE_CONSEQUENCE_PORT],
})
export class CustomerMergeConsequenceModule {}

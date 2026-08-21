import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CUSTOM_REQUEST_APPROVAL_FACTS_PORT } from './domain/repositories/custom-request-approval-facts.port';
import { DrizzleCustomRequestApprovalFactsAdapter } from './infrastructure/persistence/drizzle-custom-request-approval-facts.adapter';

/**
 * The request facts an approval freezes, published on their own (`APP6-B11`).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `CustomRequestQuotationPointerModule`,
 * `CustomRequestDesignSourceModule` and `CustomRequestDesignContextModule` set
 * for the same context: Ordering publishes narrow contracts, and a consumer
 * imports the one it is allowed to hold rather than the aggregate that contains
 * it.
 *
 * `APP6-B11`'s module does import `OrderModule` — the `TR-LC11-09` projection
 * needs `CUSTOM_REQUEST_REPOSITORY.transition` — so this module buys no
 * capability the approval transaction lacks. What it buys is a **read that is
 * not the write port**: the evidence resolver takes this, holds no
 * `transition()` and no `replaceBreakdown()`, and so cannot rewrite the
 * breakdown whose total it is freezing. The narrowness is the resolver's, not
 * the module's.
 *
 * `DatabaseModule` is imported for the adapter's executor and is **not**
 * re-exported, so importing this module confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: CUSTOM_REQUEST_APPROVAL_FACTS_PORT,
      useClass: DrizzleCustomRequestApprovalFactsAdapter,
    },
  ],
  exports: [CUSTOM_REQUEST_APPROVAL_FACTS_PORT],
})
export class CustomRequestApprovalFactsModule {}

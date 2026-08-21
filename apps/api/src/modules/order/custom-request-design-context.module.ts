import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CUSTOM_REQUEST_DESIGN_CONTEXT_PORT } from './domain/repositories/custom-request-design-context.port';
import { DrizzleCustomRequestDesignContextAdapter } from './infrastructure/persistence/drizzle-custom-request-design-context.adapter';

/**
 * The design-authoring context of a request, published on its own
 * (`APP6-B08` §5).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `CustomRequestQuotationPointerModule` and
 * `CustomRequestDesignSourceModule` set for the same context and the same
 * reason: Ordering publishes narrow contracts, and a consumer imports the one it
 * is allowed to hold rather than the aggregate that contains it.
 *
 * It exists rather than adding the provider to `OrderModule` because
 * `OrderModule` exports `CUSTOM_REQUEST_REPOSITORY` and `ORDER_REPOSITORY` — the
 * AGG-13 and AGG-15 **write** contracts. `APP6-B08` must not move a request at
 * all: `TR-LC11-08` (`→ DESIGN_REVIEW`) belongs to `APP6-B09`, and a module that
 * imported `OrderModule` to read a status would gain `transition()` in the same
 * injector. Keeping the export surface at one read port is what makes "authoring
 * a draft cannot move a request" true of the wiring, not merely of today's code.
 *
 * `DatabaseModule` is imported for the adapter's executor and is **not**
 * re-exported, so importing this module confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: CUSTOM_REQUEST_DESIGN_CONTEXT_PORT,
      useClass: DrizzleCustomRequestDesignContextAdapter,
    },
  ],
  exports: [CUSTOM_REQUEST_DESIGN_CONTEXT_PORT],
})
export class CustomRequestDesignContextModule {}

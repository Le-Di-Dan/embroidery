import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CUSTOM_REQUEST_DESIGN_SOURCE_PORT } from './domain/repositories/custom-request-design-source.port';
import { DrizzleCustomRequestDesignSourceAdapter } from './infrastructure/persistence/drizzle-custom-request-design-source.adapter';

/**
 * The submitted-design pointer, published on its own (`APP6-B07` §5, §11).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `CustomRequestQuotationPointerModule` set for the same context and
 * the same reason: Ordering publishes narrow contracts, and a consumer imports
 * the one it is allowed to hold rather than the aggregate that contains it.
 *
 * It exists rather than adding the provider to `OrderModule` because
 * `OrderModule` exports `CUSTOM_REQUEST_REPOSITORY` and `ORDER_REPOSITORY` —
 * the AGG-13 and AGG-15 **write** contracts. A read surface that imported it to
 * resolve one pointer would gain `transition()`, `submit()` and `lockById()` in
 * the same injector. Keeping the export surface at one port is what makes "this
 * read cannot move a request" true of the wiring rather than of the code that
 * happens to be written today.
 *
 * It declares no controller, so it publishes no route, and it holds no
 * transaction manager of its own to hand out: `DatabaseModule` is imported for
 * the adapter's executor and is not re-exported, so importing this module
 * confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: CUSTOM_REQUEST_DESIGN_SOURCE_PORT,
      useClass: DrizzleCustomRequestDesignSourceAdapter,
    },
  ],
  exports: [CUSTOM_REQUEST_DESIGN_SOURCE_PORT],
})
export class CustomRequestDesignSourceModule {}

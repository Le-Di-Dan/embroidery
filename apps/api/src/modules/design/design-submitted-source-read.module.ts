import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { SUBMITTED_DESIGN_SOURCE_REPOSITORY } from './domain/repositories/submitted-design-source.repository';
import { DrizzleSubmittedDesignSourceRepository } from './infrastructure/persistence/drizzle-submitted-design-source.repository';

/**
 * The submitted-design source, published on its own (`APP6-B07` §5, §11).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `CatalogPlacementReadModule` set for the read half of a context that
 * also owns writes and controllers.
 *
 * It exists rather than being served by `DesignModule` because `DesignModule`
 * exports `DESIGN_SESSION_REPOSITORY` — the AGG-09 **write** contract — along
 * with the anonymous Session guard, its secret verifier, its cookie policy, its
 * rate limiter and the `DESIGN_SESSION_AUTH_CONFIG` pepper. An Admin read that
 * imported it to fetch one document would gain `submit()`, `saveDocument()` and
 * `rotateSecret()` in the same injector, and would boot the whole anonymous
 * Session authorization stack — including a pepper it has no use for — to answer
 * a question that needs neither. Keeping the export surface at one port is what
 * makes "this read cannot mutate a Design Session" true of the wiring rather
 * than of the code that happens to be written today.
 *
 * Ownership does not move: the contract, its adapter and its SQL are Design's,
 * and Ordering consumes them as a port rather than reading `design_sessions`
 * itself (`BACKEND_CONVENTIONS.md` §10).
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
      provide: SUBMITTED_DESIGN_SOURCE_REPOSITORY,
      useClass: DrizzleSubmittedDesignSourceRepository,
    },
  ],
  exports: [SUBMITTED_DESIGN_SOURCE_REPOSITORY],
})
export class DesignSubmittedSourceReadModule {}

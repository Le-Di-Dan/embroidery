import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { DesignSubmittedSourceReadModule } from '../design/design-submitted-source-read.module';
import { CustomRequestDesignSourceModule } from './custom-request-design-source.module';
import { ReadSubmittedDesign } from './application/admin/read-submitted-design.query';
import { AdminCustomRequestSubmittedDesignController } from './presentation/admin-custom-request-submitted-design.controller';

/**
 * `APP6-B07` — the Admin submitted-design read.
 *
 * A **fourth** module on the `admin/custom-requests` base path, beside
 * `APP5-B04`'s reads, `APP5-B05`'s mutations and `APP5-B06`'s binary delivery,
 * and it is a fourth module for the reason all three of those are separate: what
 * a module can inject is what its route can eventually do.
 *
 * Its dependencies are **three**, and the short list is the point:
 *
 * - `IdentityModule` — the APP1 guard, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `CustomRequestDesignSourceModule` — one read-only Ordering port returning
 *   two ids. Not `OrderModule`, which exports the AGG-13 write contract, so
 *   `transition()`, `submit()` and `lockById()` are unreachable from this
 *   injector;
 * - `DesignSubmittedSourceReadModule` — one read-only Design port returning one
 *   document. Not `DesignModule`, which exports `DESIGN_SESSION_REPOSITORY` and
 *   the whole anonymous Session authorization stack, so `saveDocument()`,
 *   `rotateSecret()`, `submit()` and the session pepper are unreachable too.
 *
 * What is **absent** is what keeps this a read module. There is no
 * `DatabaseModule` import, so no `TransactionManager` and no executor can be
 * injected: nothing composed here can open a transaction, and a write that
 * needed one could not be added without changing this file. There is no design
 * case or version repository, no approval-snapshot repository, no quotation
 * repository, no grant issuer, no asset repository, no object-storage client, no
 * audit recorder and no outbox. `APP6-B08` composes the authoring side
 * deliberately; nothing here can be mistaken for it.
 *
 * It exports nothing. There is one entry point and it is a `GET`.
 */
@Module({
  imports: [IdentityModule, CustomRequestDesignSourceModule, DesignSubmittedSourceReadModule],
  controllers: [AdminCustomRequestSubmittedDesignController],
  providers: [ReadSubmittedDesign],
})
export class CustomRequestSubmittedDesignModule {}

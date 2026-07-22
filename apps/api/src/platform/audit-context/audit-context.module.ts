import { Global, Module } from '@nestjs/common';

import { AuditClock } from './audit-clock';
import { AuditMetadataFactory } from './audit-metadata.factory';

/**
 * Audit metadata wiring (APP0-B04).
 *
 * Global for the same reason `RequestContextModule` is: every bounded context
 * emits audit events, so requiring each one to import a platform module to learn
 * who is acting would add an import to fourteen modules and teach nothing. It
 * exports values only — no repository, no persistence, no service locator.
 *
 * `RequestContextService` is resolved from the global `RequestContextModule`,
 * whose middleware has run before any handler this factory is called from.
 */
@Global()
@Module({
  providers: [AuditClock, AuditMetadataFactory],
  exports: [AuditClock, AuditMetadataFactory],
})
export class AuditContextModule {}

import { Injectable } from '@nestjs/common';

import { RequestContextService } from '../request-context/request-context.service';
import { AuditClock } from './audit-clock';
import type { AuditMetadata } from './audit-metadata';

/**
 * Builds the audit metadata snapshot for the current request (APP0-B04).
 *
 * Pure with respect to the outside world: it reads the context and the clock and
 * returns a value. It writes no row, emits no event and logs nothing — audit
 * persistence stays with the audit module and its own checkpoint.
 *
 * There is no out-of-request variant. A worker or sweep has no request ID, and
 * the two tempting fallbacks are both worse than failing: inventing an ID would
 * produce records that look correlated but are not, and defaulting to a system
 * actor would silently grant automated attribution to whatever called it.
 */
@Injectable()
export class AuditMetadataFactory {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /**
   * Snapshots the request ID, the current actor and the current instant.
   *
   * Throws `RequestContextUnavailableError` outside a request.
   */
  forCurrentRequest(): AuditMetadata {
    const requestId = this.requestContext.requireRequestId();
    const actor = this.requestContext.requireActor();

    // A copy of the clock's value: the snapshot must not share an instance with
    // the caller of the clock, and `Object.freeze` cannot protect a Date's own
    // internal time. The returned object is frozen, so the field itself — like
    // the actor, which its factory already froze — cannot be replaced.
    return Object.freeze({
      requestId,
      actor,
      occurredAt: new Date(this.clock.now().getTime()),
    });
  }
}

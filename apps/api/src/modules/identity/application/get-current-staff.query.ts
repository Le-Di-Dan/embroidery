/**
 * Current-staff read model (APP1-B02).
 *
 * The authenticated-admin guard has already resolved the live session and the
 * account behind it, so this query performs no authentication, no cookie work
 * and no repository lookup — it maps the already-trusted projection down to the
 * minimum safe identity the Admin shell needs. It is the single place that
 * decides what leaves the server, which is why the mapping is explicit rather
 * than a spread: the resolved session also carries the internal `sessionId`,
 * and that must never reach the response.
 */
import { Injectable } from '@nestjs/common';

import type { ResolvedStaffSession } from './resolve-staff-session.service';

/** The public current-staff identity — exactly what the Admin shell consumes. */
export interface CurrentStaffView {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

@Injectable()
export class GetCurrentStaffQuery {
  /**
   * Projects the resolved session onto the public identity. Explicit fields
   * only: no credential, no session reference, no role — the single ADMIN actor
   * has no permission model (REQ-IDN-001, ADR-APP1-001).
   */
  execute(session: ResolvedStaffSession): CurrentStaffView {
    return {
      id: session.adminId,
      email: session.email,
      displayName: session.displayName,
    };
  }
}

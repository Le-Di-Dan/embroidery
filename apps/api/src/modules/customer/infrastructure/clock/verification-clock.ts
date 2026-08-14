import { Injectable } from '@nestjs/common';

/**
 * The instant verification issuance reasons about (`APP4-B03`).
 *
 * Its own clock rather than a shared one, following the reason `AuditClock` is
 * separate from `ResponseClock`: expiry, the resend cooldown and the issuance
 * rate window are all business durations measured from this instant, and binding
 * them to the audit or response layer's clock would couple three unrelated
 * concerns to one another's format and lifetime.
 *
 * It exists so `new Date()` never appears inside the issue or resend path. That
 * is what lets a suite prove a 60-second cooldown and a 900-second rate window
 * without waiting either of them out, and it is the only seam those tests need —
 * nothing else about the flow is time-dependent.
 */
@Injectable()
export class VerificationClock {
  now(): Date {
    return new Date();
  }
}

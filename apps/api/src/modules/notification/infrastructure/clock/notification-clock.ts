import { Injectable } from '@nestjs/common';

/**
 * The instant Notification decisions are taken against (`APP4-B08`).
 *
 * One seam, so a suite can prove "this challenge expired one second ago refuses
 * the replay" without waiting ten minutes. It mirrors `VerificationClock` in the
 * customer module rather than reusing it: that class belongs to a module this
 * one deliberately does not import, and importing it for a `Date` would create
 * exactly the dependency `RequestNotificationUseCase` was built to avoid.
 *
 * Separate from `AuditClock` for the reason that class records about
 * `ResponseClock`: `occurred_at` is when an action was *recorded*, and replay
 * eligibility is a business decision about whether a secret is still live. They
 * coincide today and are not the same fact.
 */
@Injectable()
export class NotificationClock {
  now(): Date {
    return new Date();
  }
}

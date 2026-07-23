import { Injectable } from '@nestjs/common';

/**
 * Supplies the wall-clock instant stamped on a log record (APP0-B05).
 *
 * A distinct injectable rather than a reuse of `ResponseClock` or `AuditClock`:
 * those are owned by the HTTP response and audit layers respectively, and a log
 * timestamp is neither a transport envelope value nor a business `occurred_at`.
 * It exists so `new Date()` never appears inside the record factory, which lets
 * tests assert an exact timestamp instead of a window.
 *
 * Duration is measured separately with a monotonic clock (see the request
 * interceptor); this wall clock is only for the human-facing `timestamp`.
 */
@Injectable()
export class LogClock {
  now(): Date {
    return new Date();
  }
}

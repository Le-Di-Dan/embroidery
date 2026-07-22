import { Injectable } from '@nestjs/common';

/**
 * Supplies the instant an audited action occurred (APP0-B04).
 *
 * Separate from `ResponseClock` rather than shared with it: that clock belongs
 * to the HTTP response layer and formats a transport string for the envelope,
 * while `occurred_at` is a business fact stored as an instant. Reusing it would
 * make audit metadata depend on the response module and on a display format.
 *
 * It exists at all so `new Date()` never appears inside the metadata factory:
 * tests can then assert an exact snapshot instead of a time window.
 */
@Injectable()
export class AuditClock {
  now(): Date {
    return new Date();
  }
}

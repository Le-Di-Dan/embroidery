/**
 * The authoritative clock for staff session lifetime (ADR-APP1-001 §4).
 *
 * Server time is authoritative — client clock skew is never trusted. Injectable
 * so tests drive expiry and renewal deterministically; production returns the
 * wall clock.
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class StaffClock {
  now(): Date {
    return new Date();
  }
}

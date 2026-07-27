/**
 * The injectable timer behind the hard upload duration (`APP2-B01` §14/§25.28).
 *
 * A five-minute ceiling is not testable by waiting five minutes, and a test
 * that waits is a test nobody runs. The timer is a seam so the deadline path
 * can be driven deterministically, while production keeps the real clock.
 *
 * It is deliberately not a general clock service: the only thing the intake
 * flow needs from time is "tell me when this request has run too long".
 */
import { Injectable } from '@nestjs/common';

/** Cancels a scheduled deadline. Safe to call after it has already fired. */
export type CancelDeadline = () => void;

@Injectable()
export class UploadTimer {
  /**
   * Runs `onDeadline` after `delayMs`.
   *
   * `unref` is deliberately absent: a pending upload deadline should keep the
   * process alive long enough to abort the request properly during a drain.
   */
  schedule(delayMs: number, onDeadline: () => void): CancelDeadline {
    const handle = setTimeout(onDeadline, delayMs);
    return () => {
      clearTimeout(handle);
    };
  }
}

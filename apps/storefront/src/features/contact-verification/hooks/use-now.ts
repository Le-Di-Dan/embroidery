'use client';

import { useEffect, useState } from 'react';

/**
 * The current instant, re-read once a second while a countdown is running.
 *
 * One timer for the whole screen, started only while something is actually
 * counting down and cleared the moment it is not — a resend cooldown is the only
 * thing on this route that changes without input, so an always-on interval would
 * be a wake-up per second for a screen that is usually idle.
 *
 * It ticks the clock rather than a remaining-seconds counter, because the value
 * that matters is the comparison against the server's `resendAvailableAt`. A
 * locally decremented counter would drift, and would keep counting through a
 * suspend that the wall clock simply skips.
 *
 * Deliberately **not** a poll: nothing here calls the API. The status endpoint
 * is read once after a refusal, and never on a timer (§11).
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    // Re-sync immediately so a countdown that starts between ticks is not shown
    // one second stale for its first frame.
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  return now;
}

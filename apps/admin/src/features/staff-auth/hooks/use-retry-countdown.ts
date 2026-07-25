'use client';

import { useEffect, useState } from 'react';

/**
 * Count down from `seconds` (a validated Retry-After value) to zero, one tick
 * per second. Passing `null` keeps it inactive. The interval is always cleared
 * on unmount or when `seconds` changes, so no timer leaks and the button
 * re-enables at zero without a page reload.
 */
export function useRetryCountdown(seconds: number | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (seconds === null || seconds <= 0) {
      setRemaining(0);
      return;
    }
    setRemaining(seconds);
    const intervalId = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, [seconds]);

  return remaining;
}

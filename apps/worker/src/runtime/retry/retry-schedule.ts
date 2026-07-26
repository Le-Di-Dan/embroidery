/**
 * The bounded exponential backoff locked by APP2-I02 §11:
 *
 *     delay = min(backoffBaseMs × 2^(attemptNo − 1), backoffMaxMs)
 *
 * No jitter in APP2. Jitter matters when many workers retry the same failure at
 * the same instant; at this scale the cap already bounds the load, and adding
 * randomness would make the retry schedule untestable for no measured benefit.
 */

/**
 * `2^30` doublings is far past any real `backoffMaxMs`, and stopping there
 * keeps the multiplication inside a safe integer instead of drifting into
 * floating-point territory before the cap can apply.
 */
const MAX_DOUBLINGS = 30;

export function retryDelayMs(
  attemptNo: number,
  backoffBaseMs: number,
  backoffMaxMs: number,
): number {
  if (!Number.isInteger(attemptNo) || attemptNo < 1) {
    throw new RangeError('Attempt numbers start at 1.');
  }

  const doublings = Math.min(attemptNo - 1, MAX_DOUBLINGS);
  const raw = backoffBaseMs * 2 ** doublings;

  // `Math.min` after an overflow-capped multiplication: the cap is the whole
  // point, so it must be applied to a number that is still exact.
  return Math.min(raw, backoffMaxMs);
}

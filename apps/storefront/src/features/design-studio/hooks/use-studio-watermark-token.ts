'use client';

/**
 * The one runtime watermark token (`APP3-S09`).
 *
 * `useState` with a lazy initialiser rather than `useMemo`: a memo is a
 * performance hint React is allowed to discard and recompute, and a token that
 * could silently change mid-session would make two screenshots of one session
 * carry two different marks. `useState`'s initialiser runs exactly once per
 * mount and its value is never recomputed, which is the guarantee this needs.
 *
 * So the token is stable across every rerender the editor causes — a selection,
 * a move, a resize, a rotate, a text edit, an image replacement, a layer
 * reorder, a lock, a hide, a zoom, a pan — and changes only when the Studio
 * runtime is genuinely mounted again, which is what a reload does.
 *
 * It is returned and nothing else. It is not put in a store (a store outlives
 * the mount, which would defeat regeneration), not written to `localStorage`,
 * not sent anywhere, and not logged.
 */
import { useState } from 'react';

import { mintWatermarkToken } from '../model/studio-watermark';

export function useStudioWatermarkToken(): string {
  const [token] = useState(mintWatermarkToken);
  return token;
}

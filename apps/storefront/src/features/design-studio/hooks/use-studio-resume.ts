'use client';

/**
 * The resume handle for one placement (`APP3-S10`).
 *
 * `APP3-S01` deliberately kept the Session id in component state and nowhere
 * else, and recorded that resume across a full reload needed a persistence
 * contract no accepted authority provided — that path being `APP3-S10`'s.
 * `APP3-G03` provides exactly one: the **non-secret** Session id, under a
 * namespaced key. This hook is that contract and nothing wider.
 *
 * ## Why the handle is read in an effect and not during render
 *
 * `localStorage` does not exist on the server. Reading it during render would
 * either throw there or make the first client render disagree with the HTML that
 * was sent — and the disagreement would be a resume prompt appearing, for one
 * frame, over a screen that had already offered the picker. So the server render
 * knows nothing, and the first effect after mount supplies the truth.
 *
 * ## Why declining is remembered in memory only
 *
 * `Bắt đầu lại` forgets the handle outright, so there is nothing left to
 * remember. The in-memory flag exists for the frame between the two.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  clearResumeHandle,
  readResumeHandle,
  writeResumeHandle,
  type StudioResumeScope,
} from '../model/studio-resume-handle';

export interface UseStudioResumeResult {
  /** The stored Session id for this exact placement, or `null`. */
  readonly handle: string | null;
  /** Whether the approved resume state should be offered instead of the picker. */
  readonly offered: boolean;
  /** Remembers a Session this browser just opened. Never a secret. */
  readonly remember: (sessionId: string) => void;
  /** Forgets it — an expiry, a refusal, or an explicit fresh start. */
  readonly forget: () => void;
}

/**
 * The placement is taken as three strings rather than as an object.
 *
 * A `{productSlug, sideCode, areaCode}` literal is a new value on every render,
 * so an effect depending on it would re-read storage sixty times a second during
 * a gesture — and pinning it with a hand-written dependency list would be a
 * dependency array that lies about what the effect reads. Three strings are
 * `Object.is`-stable, so every list below is genuinely exhaustive.
 */
export function useStudioResume(
  productSlug: string,
  sideCode: string | undefined,
  areaCode: string | undefined,
): UseStudioResumeResult {
  const [handle, setHandle] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  const scope = useMemo<StudioResumeScope | null>(
    () =>
      sideCode === undefined || areaCode === undefined ? null : { productSlug, sideCode, areaCode },
    [productSlug, sideCode, areaCode],
  );

  useEffect(() => {
    if (scope === null) {
      setHandle(null);
      return;
    }
    // Re-read per placement, so moving to another Side or Area cannot carry one
    // placement's answer into another.
    setDeclined(false);
    setHandle(readResumeHandle(scope));
  }, [scope]);

  const remember = useCallback(
    (sessionId: string) => {
      if (scope === null) return;
      writeResumeHandle(scope, sessionId);
      setHandle(sessionId);
      setDeclined(false);
    },
    [scope],
  );

  const forget = useCallback(() => {
    if (scope !== null) clearResumeHandle(scope);
    setHandle(null);
    setDeclined(true);
  }, [scope]);

  return { handle, offered: handle !== null && !declined, remember, forget };
}

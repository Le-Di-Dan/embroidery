'use client';

/**
 * The one thing in the Studio runtime that knows the Session's server revision.
 *
 * Two capabilities mutate a Session and both are compare-and-set on it:
 * `APP3-B08` autosave and `APP3-B06B` image upload. Each returns the revision it
 * produced, and whichever mutates next must present *that* number or be refused
 * as stale. Before `APP3-E01-C1` each capability kept its own copy of the
 * bootstrap revision and advanced only its own, so an upload left the next
 * autosave stale — `409`, and a customer with one tab open shown a conflict with
 * nobody (`FU-APP3-UPLOAD-REVISION-SEAM-01`).
 *
 * ## Why a ref and not state
 *
 * The revision is not drawn. Nothing on screen reads it, and holding it in state
 * would re-render the stage every time a save answered — for a number no pixel
 * depends on. It also makes the invariant in §6 of the correction true by
 * construction: adopting a revision cannot mark the document clean, cannot clear
 * the past, cannot replace the working document and cannot arm a save, because
 * adopting it renders nothing at all.
 *
 * ## Monotonic
 *
 * Responses can land out of order — an older save answering after a newer
 * upload. A revision therefore never moves backward inside one Session; only a
 * *new* authoritative read (a bootstrap or a resume, which arrives as a changed
 * input) may set it outright.
 *
 * ## Owned by a Session
 *
 * Every adoption names the Session it was measured against. A response for a
 * Session the customer has left cannot raise the revision of the one they are in
 * now: those numbers count different things, and presenting one for the other
 * would be refused by the server at best and would silently pass at worst.
 */
import { useRef } from 'react';

export interface StudioSessionRevision {
  /** The revision the next mutation must present. */
  readonly read: () => number;
  /** Adopts the revision a successful response for `sessionId` reported. */
  readonly adopt: (sessionId: string, revision: number) => void;
}

export function useStudioSessionRevision(
  sessionId: string | null,
  revision: number,
): StudioSessionRevision {
  const current = useRef(revision);
  const bound = useRef({ sessionId, revision });

  /*
   * A new Session, or a new authoritative snapshot of this one, replaces
   * whatever a mutation left here.
   *
   * Adjusted during render rather than in an effect, deliberately. An effect
   * runs *after* the tree is interactive, so a handler firing in that window
   * would present the previous Session's revision. The adjustment is keyed on a
   * comparison rather than a counter, so re-running it changes nothing.
   */
  if (bound.current.sessionId !== sessionId || bound.current.revision !== revision) {
    bound.current = { sessionId, revision };
    current.current = revision;
  }

  const authority = useRef<StudioSessionRevision>({
    read: () => current.current,
    adopt: (forSession, next) => {
      if (forSession !== bound.current.sessionId) return;
      if (next <= current.current) return;
      current.current = next;
    },
  });

  return authority.current;
}

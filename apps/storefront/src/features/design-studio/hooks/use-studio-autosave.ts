'use client';

/**
 * The autosave loop (`APP3-S10`), over `APP3-B08`'s compare-and-set write.
 *
 * ## One request at a time, and the revision is always the server's
 *
 * A save presents the revision the client last **read**. `APP3-B08` accepts a
 * match, persists one canonical document and advances the revision once;
 * anything else is `409` with zero write. So this controller never computes the
 * next revision, never holds two requests open, and never replays a request
 * whose outcome it does not know.
 *
 * ## The three things that can go wrong, and why they are different
 *
 * - **A refusal with a status.** The server answered. What it said is what
 *   happened, and `409` in particular means the write did *not* occur.
 * - **No answer at all.** A timeout, a reset connection or a dropped request:
 *   the PUT may have reached the server and had its response lost, so the
 *   outcome is genuinely unknown — and a blind replay here is how a stale
 *   document overwrites a good one. Every such outcome reads the latest
 *   Session state *first* and decides from what it finds.
 * - **The Session is gone.** Nothing may be saved into it again, and no
 *   credential can be recovered: the secret is an `HttpOnly` cookie this code
 *   cannot read even in principle.
 *
 * No `setInterval`, no polling, no `sendBeacon`, no save from `beforeunload`, no
 * background sync, no service worker — and no merge of two documents, ever.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  classifyAmbiguousOutcome,
  isRetryableFailure,
  retryDelayFor,
  SAVE_HELD_STATES,
  saveDelayFor,
  type StudioDirtyStreak,
  type StudioSaveFailure,
  type StudioSaveInFlight,
  type StudioSaveState,
  type StudioServerSnapshot,
} from '../model/studio-autosave';
import { sameDocument } from '../model/studio-history';
import { sessionKeyOf } from '../model/studio-session-key';
import { attemptSave, readLatestSnapshot } from '../services/studio-autosave.client';
import { useStudioDocumentStore } from '../store/studio-document.store';

export interface UseStudioAutosaveInput {
  readonly sessionId: string;
  /** The revision the bootstrap or resume response carried. Never incremented here. */
  readonly revision: number;
  /** The Session is gone. The screen, not this hook, decides what to show. */
  readonly onExpired: () => void;
}

export interface UseStudioAutosaveResult {
  readonly state: StudioSaveState;
  /** Why the last attempt failed, for truthful copy. Never rendered raw. */
  readonly failure: StudioSaveFailure | null;
  /** An automatic attempt is armed. Spent ladders are `ERROR_PAUSED` instead. */
  readonly retryPending: boolean;
  /** From a real successful response or a real authoritative read. Never a guess. */
  readonly lastSavedAt: number | null;
  /** The customer chose to keep designing with the failure on screen. */
  readonly dismissed: boolean;
  readonly retry: () => void;
  readonly dismiss: () => void;
  readonly loadLatest: () => void;
  readonly keepLocal: () => void;
}

export function useStudioAutosave(input: UseStudioAutosaveInput): UseStudioAutosaveResult {
  const { sessionId, revision, onExpired } = input;

  const [state, setState] = useState<StudioSaveState>('CLEAN');
  const [failure, setFailure] = useState<StudioSaveFailure | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // The loop's own memory. Refs rather than state: a gesture commits the working
  // document every pointer frame, and a dirty streak held in state would
  // re-render the stage sixty times a second to store a timestamp nothing draws.
  const stateRef = useRef<StudioSaveState>('CLEAN');
  const serverRevision = useRef(revision);
  const streak = useRef<StudioDirtyStreak | null>(null);
  const inFlight = useRef<StudioSaveInFlight | null>(null);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestServer = useRef<StudioServerSnapshot | null>(null);
  const seenSerial = useRef<number | null>(null);
  const mounted = useRef(true);

  const documentSerial = useStudioDocumentStore((store) => store.documentSerial);
  const serverSerial = useStudioDocumentStore((store) => store.serverSerial);

  // A new state is a new thing to say: a dismissal was about the message the
  // customer dismissed, not about every later one, so it does not carry over.
  const enter = useCallback((next: StudioSaveState) => {
    stateRef.current = next;
    setState(next);
    setDismissed(false);
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const runSaveRef = useRef<(() => void) | null>(null);

  const schedule = useCallback(() => {
    clearTimer();
    const current = streak.current;
    if (current === null || SAVE_HELD_STATES.has(stateRef.current)) return;
    setRetryPending(false);
    const delay = saveDelayFor(current, Date.now());
    timer.current = setTimeout(() => {
      runSaveRef.current?.();
    }, delay);
  }, [clearTimer]);

  const scheduleRetry = useCallback(
    (cause: StudioSaveFailure) => {
      clearTimer();
      setFailure(cause);
      const delay = retryDelayFor(attempt.current);
      if (delay === null) {
        // Spent. Nothing arms itself again until the customer presses retry or
        // makes a new edit — both explicit.
        setRetryPending(false);
        enter('ERROR_PAUSED');
        return;
      }
      attempt.current += 1;
      setRetryPending(true);
      // Still unsaved, so still dirty. `DIRTY` plus a recorded failure is what
      // the offline surface reads: the system will try again, and says so.
      enter('DIRTY');
      timer.current = setTimeout(() => {
        runSaveRef.current?.();
      }, delay);
    },
    [clearTimer, enter],
  );

  // ------------------------------------------------------------ reconciliation

  /**
   * Reads the latest Session state **once**, and decides from what it finds.
   * Never a poll, and never a replay of the write before this has answered.
   */
  const reconcileNow = useCallback(
    async (cause: 'conflict' | 'ambiguous', sent: StudioSaveInFlight) => {
      clearTimer();
      enter('RECONCILING');
      const read = await readLatestSnapshot(sessionId);
      if (!mounted.current) return;

      if (read.kind === 'failed') {
        if (read.failure === 'expired') {
          setFailure('expired');
          enter('EXPIRED');
          onExpired();
          return;
        }
        scheduleRetry(read.failure);
        return;
      }

      const latest = read.snapshot;
      serverRevision.current = latest.revision;
      latestServer.current = { document: latest.document, revision: latest.revision };

      if (cause === 'conflict') {
        setFailure('conflict');
        enter('CONFLICT');
        return;
      }

      const outcome = classifyAmbiguousOutcome({
        baseRevision: sent.expectedRevision,
        submitted: sent.submitted,
        latestRevision: latest.revision,
        latestDocument: latest.document,
        equal: sameDocument,
      });

      if (outcome === 'diverged') {
        setFailure('conflict');
        enter('CONFLICT');
        return;
      }

      if (outcome === 'absent') {
        // Nothing was written, so the same document may be offered again — and
        // only now, after the server said so, is a replay safe.
        scheduleRetry('ambiguous');
        return;
      }

      // The save arrived; only its answer was lost.
      attempt.current = 0;
      setFailure(null);
      setLastSavedAt(Date.now());
      if (streak.current === null) {
        useStudioDocumentStore.getState().reconcile(latest.document);
        enter('CLEAN');
      } else {
        enter('DIRTY');
        schedule();
      }
    },
    [clearTimer, enter, onExpired, schedule, scheduleRetry, sessionId],
  );

  // ------------------------------------------------------------------ the save

  const runSave = useCallback(() => {
    clearTimer();
    const document = useStudioDocumentStore.getState().document;
    if (document === null || inFlight.current !== null || stateRef.current === 'EXPIRED') return;

    const sent: StudioSaveInFlight = {
      submitted: document,
      expectedRevision: serverRevision.current,
    };
    inFlight.current = sent;
    // This save owns everything dirty up to this instant. An edit arriving while
    // it is in flight starts a *new* streak, which is what keeps a successful
    // response from being read as "everything is saved".
    streak.current = null;
    setRetryPending(false);
    enter('SAVING');

    void (async () => {
      const result = await attemptSave(sessionId, sent.submitted, sent.expectedRevision);
      inFlight.current = null;
      if (!mounted.current) return;

      if (result.kind === 'ok') {
        serverRevision.current = result.snapshot.revision;
        attempt.current = 0;
        setFailure(null);
        setLastSavedAt(Date.now());
        if (streak.current === null) {
          // Nothing newer exists, so the canonical form the server returned may
          // become the working document. Not a history entry: the customer did
          // nothing here.
          useStudioDocumentStore.getState().reconcile(result.snapshot.document);
          enter('CLEAN');
        } else {
          // Newer local edits exist. They are what is on screen and they stay
          // there — an older response must never overwrite them — and the next
          // save carries them.
          enter('DIRTY');
          schedule();
        }
        return;
      }

      const why = result.failure;
      if (why === 'expired') {
        setFailure('expired');
        enter('EXPIRED');
        onExpired();
        return;
      }
      if (why === 'conflict' || why === 'ambiguous') {
        void reconcileNow(why, sent);
        return;
      }
      if (isRetryableFailure(why)) {
        scheduleRetry(why);
        return;
      }
      // A refusal that repeating the request cannot make actionable: too large,
      // unprocessable, forbidden. The document stays on screen and nothing loops.
      setFailure(why);
      setRetryPending(false);
      enter('ERROR_PAUSED');
    })();
  }, [clearTimer, enter, onExpired, reconcileNow, schedule, scheduleRetry, sessionId]);

  runSaveRef.current = runSave;

  // ------------------------------------------------------------ dirty tracking

  useEffect(() => {
    if (seenSerial.current === null) {
      seenSerial.current = documentSerial;
      return;
    }
    if (documentSerial === seenSerial.current) return;
    seenSerial.current = documentSerial;
    // The newest write came from a save response, a resume or a bootstrap. The
    // customer changed nothing, so there is nothing to save back.
    if (documentSerial === serverSerial) return;
    if (stateRef.current === 'EXPIRED') return;

    const now = Date.now();
    streak.current = { since: streak.current?.since ?? now, last: now };
    // A new edit re-arms the ladder: a spent one from a network blip must not
    // leave the rest of the session permanently unsaved.
    attempt.current = 0;
    if (!SAVE_HELD_STATES.has(stateRef.current)) enter('DIRTY');
    schedule();
  }, [documentSerial, enter, schedule, serverSerial]);

  // A different Session is a different loop. Nothing carries over: not the
  // revision, not the dirty streak, not the retry ladder and not the conflict.
  useEffect(() => {
    serverRevision.current = revision;
    latestServer.current = null;
    streak.current = null;
    attempt.current = 0;
    // The store's serial as it stands *now*, not `null`: the working document
    // for this Session has already been initialized by the effect above, and
    // rearming with `null` would make the next edit look like the first
    // observation instead of a change — swallowing it silently.
    seenSerial.current = useStudioDocumentStore.getState().documentSerial;
    stateRef.current = 'CLEAN';
    setState('CLEAN');
    setFailure(null);
    setRetryPending(false);
    setLastSavedAt(null);
    setDismissed(false);
  }, [revision, sessionId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  // -------------------------------------------------------------- the commands

  const retry = useCallback(() => {
    if (stateRef.current === 'EXPIRED' || inFlight.current !== null) return;
    attempt.current = 0;
    setFailure(null);
    runSave();
  }, [runSave]);

  const dismiss = useCallback(() => {
    // Dismisses the message, not the truth behind it: the state, the failure and
    // the navigation warning are untouched, and nothing is marked saved.
    setDismissed(true);
  }, []);

  const loadLatest = useCallback(() => {
    const latest = latestServer.current;
    if (latest === null) return;
    clearTimer();
    // The customer chose the server's document. The local branch — and the past
    // that described it — is discarded deliberately.
    useStudioDocumentStore
      .getState()
      .adoptServerBranch(sessionKeyOf(sessionId, latest.revision), latest.document);
    serverRevision.current = latest.revision;
    streak.current = null;
    attempt.current = 0;
    setFailure(null);
    setRetryPending(false);
    setLastSavedAt(Date.now());
    enter('CLEAN');
  }, [clearTimer, enter, sessionId]);

  const keepLocal = useCallback(() => {
    if (latestServer.current === null) return;
    // Pressing this button *is* the intent to overwrite. It is one save, of the
    // document on screen, against the revision the server actually holds — not a
    // silent last-write-wins, because the customer chose it after being shown
    // that a newer version exists and what keeping theirs costs.
    attempt.current = 0;
    setFailure(null);
    stateRef.current = 'DIRTY';
    const now = Date.now();
    streak.current = streak.current ?? { since: now, last: now };
    runSave();
  }, [runSave]);

  return {
    state,
    failure,
    retryPending,
    lastSavedAt,
    dismissed,
    retry,
    dismiss,
    loadLatest,
    keepLocal,
  };
}

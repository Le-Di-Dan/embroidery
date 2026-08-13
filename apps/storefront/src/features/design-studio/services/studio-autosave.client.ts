import {
  publicDesignSessionAutosave,
  type AutosaveDesignSessionBody,
  type DesignSessionSnapshotResponse,
} from '@embroidery/api-client';
import type { DesignDocument } from '@embroidery/design-document';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { classifySaveFailure, type StudioSaveFailure } from '../model/studio-autosave';
import { toStudioApiError } from '../model/studio-failure';
import { resumeSession } from './studio-session.client';

/**
 * The one write this feature makes (`APP3-B08`, consumed by `APP3-S10`).
 *
 * ## The revision is presented, never predicted
 *
 * `expectedRevision` is the revision the client last **read** from a server
 * response. A matching revision persists one canonical document and advances the
 * revision exactly once; a mismatch is refused `409` with zero write. So the
 * client never computes `previous + 1`: the server's own arithmetic is the only
 * arithmetic, and a client that guessed it would present a revision the server
 * had never issued the first time two tabs raced.
 *
 * ## What this call does not do
 *
 * It does not extend `expiresAt`, does not issue or rotate a cookie, emits no
 * Outbox event and records no idempotency key — all four are `APP3-B08`'s
 * accepted semantics, and none of them is compensated for here.
 *
 * The URL is the generated operation's. Nothing in this feature builds a path
 * from a template string: a handwritten `/api/public/design-sessions/...` would
 * be a second, unreviewed copy of a contract that already exists.
 */
export async function saveSessionDocument(
  sessionId: string,
  document: DesignDocument,
  expectedRevision: number,
  signal: AbortSignal,
): Promise<DesignSessionSnapshotResponse> {
  /*
   * The one place the two `DesignDocument` declarations meet.
   *
   * `APP3-P01`'s is deeply `readonly`, because a working document is replaced
   * rather than mutated; the generated one is the same JSON with mutable arrays,
   * because that is what a schema generator emits. The values are identical and
   * the only operation performed on this one is serialization, which is a read —
   * so the cast widens what the *type* permits and changes nothing about what is
   * sent. It is deliberately confined to this line rather than solved with `any`
   * or by relaxing `APP3-P01`.
   */
  const body: AutosaveDesignSessionBody = {
    document: document as AutosaveDesignSessionBody['document'],
    expectedRevision,
  };
  try {
    const response = await publicDesignSessionAutosave(sessionId, body, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
    return response.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}

/**
 * One attempt, as a value.
 *
 * The controller above decides *what to do* about an outcome; deciding *what the
 * outcome was* is this boundary's job. Returning it rather than throwing is what
 * keeps the loop free of transport handling — and keeps "no response at all"
 * from looking, at the call site, like an ordinary rejected promise.
 */
export type StudioSaveAttempt =
  | { readonly kind: 'ok'; readonly snapshot: DesignSessionSnapshotResponse }
  | { readonly kind: 'failed'; readonly failure: StudioSaveFailure };

export async function attemptSave(
  sessionId: string,
  document: DesignDocument,
  expectedRevision: number,
): Promise<StudioSaveAttempt> {
  try {
    // Deliberately never aborted from a React cleanup. Aborting a PUT in flight
    // manufactures exactly the unknown outcome §15 exists to reconcile, and a
    // teardown leaves nobody to reconcile it — so the request is allowed to
    // finish and its answer is simply not written into a dead component.
    const snapshot = await saveSessionDocument(
      sessionId,
      document,
      expectedRevision,
      new AbortController().signal,
    );
    return { kind: 'ok', snapshot };
  } catch (error: unknown) {
    return { kind: 'failed', failure: classifySaveFailure(error) };
  }
}

/**
 * The current Session snapshot, read once during reconciliation.
 *
 * `publicDesignSessionResume` is the only accepted operation that returns it. It
 * rotates the `HttpOnly` Session secret as a side effect — the server's business,
 * carried by the browser's own cookie handling, and never read, stored or
 * emulated here.
 */
export async function readLatestSnapshot(sessionId: string): Promise<StudioSaveAttempt> {
  try {
    const snapshot = await resumeSession(sessionId, new AbortController().signal);
    return { kind: 'ok', snapshot };
  } catch (error: unknown) {
    return { kind: 'failed', failure: classifySaveFailure(error) };
  }
}

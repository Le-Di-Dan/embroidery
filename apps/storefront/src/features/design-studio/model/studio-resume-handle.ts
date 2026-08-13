/**
 * The non-secret Session resume handle (`APP3-S10`, `APP3-G03`).
 *
 * ## What may be here, and what may never be
 *
 * `APP3-G03` makes Session ownership the **pair** (id, secret) and puts the
 * secret in a host-only `HttpOnly` cookie. The id is not a credential on its own
 * — presenting it without the cookie authorizes nothing — and `APP3-G03`
 * explicitly allows a client to keep it under a namespaced key so a Session
 * survives a reload. That is the entire contents of this module: one id.
 *
 * Never stored, by construction rather than by care: the Session secret (this
 * code cannot read it — `HttpOnly`), any hash of it, the Design Document, the
 * revision, `expiresAt` as an authority, Asset or derivative bytes, and anything
 * identifying the customer. A durable copy of the document would also make the
 * approved offline copy — *"đừng đóng tab"* — a lie, because the changes really
 * would survive the tab.
 *
 * ## Why the key carries the placement
 *
 * A Session belongs to exactly one Product → Side → Embroidery Area. Offering a
 * Session opened on the chest of one shirt as the resumable design of the sleeve
 * of another would restore coordinates that mean something else there. The key
 * is composed of the three public codes, so a handle from one placement is not
 * merely unlikely to be read under another — it is stored under a different key
 * and cannot be found.
 *
 * ## Why the value is validated on the way out
 *
 * Browser storage is writable by anything else running on the origin, so a value
 * read here is untrusted input, not something this code wrote. It becomes a URL
 * path segment on the resume request, so it is checked against the id shape
 * before it is used and discarded silently if it does not match.
 */

const STORAGE_PREFIX = 'embroidery.studio.session';

/**
 * The canonical UUID shape, matching the one the generated contract publishes
 * for a `sessionId`.
 */
const SESSION_ID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export interface StudioResumeScope {
  readonly productSlug: string;
  readonly sideCode: string;
  readonly areaCode: string;
}

/** The storage key for one placement. Public codes only — no id, no secret. */
export function resumeHandleKey(scope: StudioResumeScope): string {
  return `${STORAGE_PREFIX}:${scope.productSlug}:${scope.sideCode}:${scope.areaCode}`;
}

/**
 * The one storage this feature touches.
 *
 * `localStorage` rather than `sessionStorage` because the requirement is to
 * survive a full reload *and* a reopened tab, which is exactly the difference
 * between the two. Every access is guarded: a browser in private mode, with
 * storage disabled or over quota throws on the property itself, and a Studio
 * that cannot remember a Session must still open.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readResumeHandle(scope: StudioResumeScope): string | null {
  const store = storage();
  if (store === null) return null;
  try {
    const value = store.getItem(resumeHandleKey(scope));
    // Untrusted: anything on this origin can write here. A value that is not a
    // Session id is dropped rather than sent to the API as a path segment.
    return value !== null && SESSION_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeResumeHandle(scope: StudioResumeScope, sessionId: string): void {
  const store = storage();
  if (store === null) return;
  // Refuses to write what it would refuse to read, so an unusable handle is
  // never left behind for a later load to find and discard.
  if (!SESSION_ID_PATTERN.test(sessionId)) return;
  try {
    store.setItem(resumeHandleKey(scope), sessionId);
  } catch {
    // A full or disabled store costs the resume offer, nothing else.
  }
}

/** Forgets one placement's handle. Never a prefix sweep across placements. */
export function clearResumeHandle(scope: StudioResumeScope): void {
  const store = storage();
  if (store === null) return;
  try {
    store.removeItem(resumeHandleKey(scope));
  } catch {
    // Nothing to do and nothing to report: the handle was already unusable.
  }
}

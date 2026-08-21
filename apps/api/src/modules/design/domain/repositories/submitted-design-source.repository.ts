/**
 * The read-only port an authorised Admin surface resolves the **submitted**
 * Design Session document through (`APP6-B07` §5, §7, §13).
 *
 * One method, and it is a read. That is the structural form of `APP6-B07`'s
 * zero-write guarantee, and it is the shape `APP3-B06C` already established for
 * the same table: the consuming module binds *this* port and not
 * `DESIGN_SESSION_REPOSITORY`, so `open`, `cloneFromTemplate`, `saveDocument`,
 * `advanceRevision`, `rotateSecret`, `attachAsset`, `submit` and `expire` are
 * not merely unused on this path — they are unreachable from it.
 *
 * ## The lookup carries both ids, and both are server-owned
 *
 * A caller never supplies a session id: `sessionId` comes from the request's own
 * `submitted_session_id`, and `requestId` is the request the operator was
 * already authorised for. Requiring both is what makes `APP6-B07` §13's
 * exact-source rule a property of the statement — the pointed row must also
 * point *back* at the same request — rather than a comparison some later caller
 * could forget to write.
 *
 * ## No secret, in either direction
 *
 * `session_secret_hash` is not a parameter and not a projected column. The
 * Admin proves nothing about the anonymous Session credential, nothing is
 * fabricated or rotated to stand in for it, and there is no method here that
 * could return one.
 *
 * Deliberately absent: any method taking only a `sessionId`. There is no
 * "find session by id" on this port at all, so the generic Admin Design Session
 * API `APP6-B07` §2 forbids has nothing to be built on.
 */
export const SUBMITTED_DESIGN_SOURCE_REPOSITORY = Symbol('SUBMITTED_DESIGN_SOURCE_REPOSITORY');

/** The server-owned pair that addresses one submitted source, and only one. */
export interface SubmittedDesignSourceLookup {
  /** `custom_requests.submitted_session_id`, never a caller-supplied value. */
  readonly sessionId: string;
  /** The request the operator was authorised for, and the row must agree. */
  readonly requestId: string;
}

/**
 * The safe descriptor of one submitted design source.
 *
 * Carries the persisted document, the schema version governing it and the
 * autosave revision it was frozen at — what `APP6-B08` needs to author the first
 * formal Design Version from what the customer actually submitted.
 *
 * Deliberately nothing else: no secret or digest, no expiry, no last-activity
 * instant, no placement chain, no template provenance, no storage key, no asset
 * id and no customer identity. This is the source document, not a session
 * projection and not a rendered preview.
 */
export interface SubmittedDesignSource {
  readonly sessionId: string;
  readonly document: unknown;
  readonly documentSchemaVersion: number;
  readonly revision: number;
}

export interface SubmittedDesignSourceRepository {
  /**
   * The one submitted source for this exact (request, session) pair, or nothing.
   *
   * Every term — the session's own id, the handover pointer back to the request,
   * and the `SUBMITTED` lifecycle state that makes the row truthful submitted
   * evidence — is decided inside this call against one consistent snapshot.
   * Returning `undefined` is the *only* failure shape: a purged row, a row that
   * belongs to another request and a row that is no longer submitted evidence
   * are indistinguishable from each other, and the caller is never told which.
   */
  findSubmittedSource(
    lookup: SubmittedDesignSourceLookup,
  ): Promise<SubmittedDesignSource | undefined>;
}

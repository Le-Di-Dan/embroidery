/**
 * The key a working Design Document is initialized against (`APP3-S03`).
 *
 * It lives here rather than in the store on purpose. `APP3-S01`'s rule is that
 * a Session identity may not come to rest in a Zustand store, and it is a good
 * rule — a store outlives the render that filled it and is readable by
 * everything. Composing the key outside the store means the store holds one
 * opaque string and no identity at all, so the rule needed no exception.
 *
 * The revision is part of the key because a document that arrives under a new
 * revision is a different baseline. Two snapshots of the same Session at the
 * same revision are the same design, and re-initializing on one of those would
 * silently discard whatever the customer had just done.
 */
export function sessionKeyOf(sessionId: string, revision: number): string {
  return `${sessionId}:${String(revision)}`;
}

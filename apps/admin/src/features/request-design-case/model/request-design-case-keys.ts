/**
 * The query-key factory for the Admin design-case workbench (`APP6-A02`).
 *
 * Four entries, addressed exactly as the operations they cache are addressed:
 *
 * - **the request context** is `APP5-B04`'s detail, keyed by request id. It
 *   carries the status the gate reads and the subject the source panel names,
 *   and it is re-read after a send because `APP6-B09` may project the request
 *   to `DESIGN_REVIEW` inside that transaction;
 * - **the submitted source** is `APP6-B07`, keyed by request id — the only
 *   address that operation has. No session id is a key part, because none is a
 *   parameter;
 * - **the version history** is `APP6-B08`'s list, keyed by request id for the
 *   same reason: the design case is resolved server-side and never named by the
 *   client, so a case id in a key would be a client-held pointer to a thread the
 *   client does not address;
 * - **one version's detail** is keyed by request **and** version, because the
 *   read returns the exact version named by the path and never substitutes the
 *   current one. A key carrying only the version id would let one request's
 *   cache entry answer for another's — and the request half is what the server
 *   binds ownership to.
 *
 * The request-context key is intentionally *not* shared with `APP5-A02`'s or
 * `APP6-A01`'s. Three screens read one operation; sharing a key would make one
 * screen's cache entry answer another's bootstrap, and each has its own
 * freshness needs. They are separate caches of one endpoint, which is the honest
 * description of what they are.
 *
 * COP evidence bytes are deliberately **absent** from this factory. They are
 * cached per asset with `gcTime: 0` by the hook that owns them, because
 * retaining a customer's private photographs in a shared query cache after
 * nothing renders them is the browser-side version of what `no-store` prevents.
 *
 * Nothing else is ever a key part: no working document, no form state, no
 * selection, no error and no `AbortSignal`.
 */
const ROOT = ['admin', 'request-design-case'] as const;

export const requestDesignCaseKeys = {
  all: ROOT,
  /** `APP5-B04` detail — the gate's status and the subject branch. */
  context: (requestId: string) => [...ROOT, 'context', requestId] as const,
  /** `APP6-B07` — the submitted Design Session document, or its honest absence. */
  submittedSource: (requestId: string) => [...ROOT, 'submitted-source', requestId] as const,
  /** `APP6-B08` list — the version history. */
  versions: (requestId: string) => [...ROOT, 'request', requestId, 'versions'] as const,
  /** The exact-version detail: document, decisions and approval evidence. */
  versionDetail: (requestId: string, versionId: string) =>
    [...ROOT, 'request', requestId, 'version', versionId] as const,
} as const;

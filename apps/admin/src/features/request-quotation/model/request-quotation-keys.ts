/**
 * The query-key factory for the Admin quotation workbench (`APP6-A01`).
 *
 * Three entries, addressed exactly as the operations they cache are addressed:
 *
 * - **the request context** is `APP5-B04`'s detail, keyed by request id. It is
 *   the read that carries the `quotationId` locator, so it is re-read after a
 *   create — that is what makes a fresh DRAFT survive a reload;
 * - **the version history** is keyed by *quotation* id, not request id. A
 *   history entry cached under a request would answer for whatever quotation
 *   that request happens to point at later;
 * - **one version's detail** is keyed by quotation **and** version, because
 *   `APP6-B02` returns the exact version named by the path and never substitutes
 *   the current one. A key carrying only the version id would let one
 *   quotation's cache entry answer for another's.
 *
 * The request-context key is intentionally *not* `customRequestDetailKeys`. The
 * two screens read the same operation, and sharing a key would make A02's cache
 * entry — written before this contract carried `quotationId` — answer this
 * screen's bootstrap. They are separate caches of one endpoint, which is the
 * honest description of what they are.
 *
 * Nothing else is ever a key part: no amount, no form state, no error and no
 * `AbortSignal`.
 */
const ROOT = ['admin', 'request-quotation'] as const;

export const requestQuotationKeys = {
  all: ROOT,
  /** `APP5-B04` detail, read here for the subject and the quotation locator. */
  context: (requestId: string) => [...ROOT, 'context', requestId] as const,
  history: (quotationId: string) => [...ROOT, 'quotation', quotationId, 'versions'] as const,
  versionDetail: (quotationId: string, versionId: string) =>
    [...ROOT, 'quotation', quotationId, 'version', versionId] as const,
} as const;

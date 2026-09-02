/**
 * The Wave-2 public operation matrix (`APP12-G02`, extended by `APP12-C01`).
 *
 * This file is the **runtime transcription** of
 * `docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md` §3 and §7. The authority
 * document classifies all public OpenAPI operations mechanically. `APP12-G02`
 * delivered two sets over 45 operations — 31 `DENY`, 14 `ALLOW` — and
 * `APP12-B04` makes it three sets over **49**:
 *
 * ```text
 * static DENY   28   withheld whole, by operation id
 * static ALLOW  18   released whole, by operation id
 * scope-gated    3   decided from the resolved grant scope, not the operation
 * ```
 *
 * B04 published four Ready-Made operations (all `ALLOW`) and moved three
 * secure-token operations out of `DENY` into the scope-gated class, where a
 * `REQUEST_ACCESS` grant is still refused while Wave 2 is unreleased — see
 * {@link SCOPE_GATED_PUBLIC_OPERATIONS}. Nothing withheld before B04 is
 * reachable after it.
 *
 * All three sets are written out in full rather than derived from a prefix,
 * because a prefix rule is exactly how `publicProductPlacement_get` (custom) and
 * `publicProduct_detail` (Wave-1 catalog) end up on the same side of a gate.
 *
 * The keys are canonical operation ids — the same `<domain>_<method>` identifiers
 * the generated client depends on, minted by `createOperationId`. The guard
 * derives the id of the handler it is about to admit with that same function, so
 * the gate and the published contract cannot drift apart: a controller rename
 * that would reissue an operation id also moves the route out of this set, and
 * the authority spec fails when either list stops matching the generated
 * document.
 *
 * ## Why every allowed operation is listed too
 *
 * A deny-list alone answers "is this withheld". It cannot answer "did we
 * accidentally withhold something released", which is the more expensive
 * mistake: denying `publicVerification_*` denies Ready-Made checkout and
 * therefore denies Wave 1 (§3.1). Listing every set lets one test assert that
 * their union is exactly the public operations the contract publishes, so an
 * operation added by a later checkpoint cannot slip through unclassified.
 */

/**
 * The 28 wholly withheld operations, grouped as §3 groups them.
 *
 * Wave 1 releases none of these. Each group's membership is a product fact
 * recorded in the authority document, not a judgement made here.
 *
 * Three ids `APP12-G02` listed here are in {@link SCOPE_GATED_PUBLIC_OPERATIONS}
 * instead since `APP12-B04`. They were not released: their refusal moved from
 * the guard to the grant scope, because each of them serves both waves through
 * one operation.
 */
export const WAVE2_WITHHELD_PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  // Placement geometry — the coordinate system the editor draws on (§3.3).
  // Ready-Made sells a SKU and needs none of it.
  'publicProductPlacement_get',
  'publicProductSideBackground_get',

  // Design templates: the Studio's starting artwork.
  'publicDesignTemplate_list',
  'publicDesignTemplate_detail',
  'publicDesignTemplateAsset_get',

  // Design sessions: the Studio itself — bootstrap, resume, autosave and the
  // customer's own uploaded artwork.
  'publicDesignSession_create',
  'publicDesignSession_resume',
  'publicDesignSession_autosave',
  'publicDesignSessionAsset_create',
  'publicDesignSessionAsset_get',
  'publicDesignSessionAsset_status',

  // Custom request intake and the customer's grant-scoped status read.
  'publicCustomRequest_submit',
  'publicCustomRequest_status',
  'publicCustomRequestAsset_upload',
  'publicCustomRequestAsset_status',

  // The customer quotation family: read, accept, reject.
  'publicQuotation_current',
  'publicQuotation_accept',
  'publicQuotation_reject',

  // The customer design-review family: read, approve, request a revision.
  'publicDesignReview_current',
  'publicDesignReview_approve',
  'publicDesignReview_requestRevision',

  // The custom DEPOSIT payment family (§3.4). Ready-Made is
  // PAYMENT_KIND = FULL and has no deposit; `APP12-B04` composed that surface
  // as new operations rather than reusing these three, which resolve a
  // REQUEST_ACCESS grant and have no Ready-Made caller.
  'publicOrderDeposit_current',
  'publicOrderDeposit_qr',
  'publicOrderDeposit_initiate',

  // The custom REMAINING payment family (§3.4).
  'publicOrderFinalPayment_current',
  'publicOrderFinalPayment_qr',
  'publicOrderFinalPayment_initiate',

  // The customer shipping-fee acknowledgement (§3.4). Ready-Made freezes an
  // Admin-set fee *before* payment, so there is nothing for the customer to
  // acknowledge afterwards.
  'publicOrderShippingFee_acknowledge',
]);

/**
 * The 18 released public operations.
 *
 * Present so a false denial is a test failure rather than a support ticket. Two
 * of these groups are the ones §4 rule 4 warns about — "deny the capability, not
 * the primitive":
 *
 * - `publicVerification_*` is contact verification (§3.1). Its contract carries
 *   `contactKind` and `purpose` and no custom-request coupling at all.
 *   `APP12-P01` locks it as the shared identity primitive Ready-Made checkout
 *   depends on. Denying it because custom flows also use it would deny Wave 1.
 * - `publicProduct*` is the Wave-1 catalog and the Ready-Made entry point. Only
 *   the placement and side-background operations above are custom, and they are
 *   withheld individually rather than by denying the `publicProduct` prefix.
 */
export const WAVE1_RELEASED_PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  // Public catalog reads (§3, `WAVE1_PUBLIC_READ`).
  'publicProduct_list',
  'publicProduct_detail',
  'publicProductMedia_get',
  'publicProductVariant_list',

  // The dynamic category inventory (`APP12-C01`). A Wave-1 public read by the
  // same argument as the catalog list it filters: it publishes published,
  // non-archived category names and slugs, which is browsing metadata for
  // Ready-Made discovery, and it names no custom capability — no placement, no
  // template, no session, no design. Withholding it would leave Wave 1 unable
  // to render its own category navigation.
  'publicCategory_list',

  // Public gallery reads.
  'publicGalleryEntry_list',
  'publicGalleryEntry_detail',
  'publicGalleryEntry_asset',

  // The sitemap inventory behind /sitemap.xml.
  'publicSitemapEntry_list',

  // The Ready-Made order-creation command (`APP12-B02`). Wave 1 by definition:
  // Ready-Made direct commerce **is** Wave 1, and withholding the operation
  // that creates the order would withhold the wave. It names no custom
  // capability — no request, no quotation, no design, no session, no deposit —
  // and its subject is a SKU, which only Wave 1 sells.
  'publicReadyMadeOrder_create',

  // Contact verification — the shared identity primitive (§3.1).
  'publicVerification_issue',
  'publicVerification_resend',
  'publicVerification_submitAttempt',
  'publicVerification_readStatus',

  // The four `APP12-B04` Ready-Made customer operations. Wave 1 by the same
  // argument as `publicReadyMadeOrder_create`: they read and pay for a
  // READY_MADE order, which only Wave 1 sells. Each is reached through an
  // ORDER_ACCESS grant, names no custom capability — no request, no quotation,
  // no design, no session, no deposit, no remaining balance — and withholding
  // any of them would leave a Wave-1 customer unable to pay for an order the
  // shop has already reserved stock for.
  'publicReadyMadeOrder_current',
  'publicOrderFullPayment_current',
  'publicOrderFullPayment_qr',
  'publicOrderFullPayment_initiate',
]);

/**
 * The operations whose release decision cannot be taken from the operation id
 * (`APP12-B04`, `APP12-RELEASE-WAVE-AUTHORITY.md` §3.2).
 *
 * `APP12-G02` classified every public operation as a whole-operation `ALLOW` or
 * `DENY`, and recorded that `publicSecureLink_resolve` was the one entry that
 * was **temporary by construction**: it was withheld only because its single
 * scope, `REQUEST_ACCESS`, had no Wave-1 caller. `APP12-DB01` added
 * `ORDER_ACCESS` and `APP12-B04` issues it, so the same operation now serves
 * both waves and no static rule can separate them.
 *
 * ```text
 * at G02 time:   publicSecureLink_resolve = DENY, whole operation
 * since B04:     gated by the resolved grant scope, not by the operation
 *                  ORDER_ACCESS   = ALLOW in both waves
 *                  REQUEST_ACCESS = ALLOW only when Wave 2 is released
 * ```
 *
 * ## Why these three, and why the decision is not here
 *
 * Each of them takes a secure-link token and nothing else, and each therefore
 * learns its wave only after digesting that token and reading the grant row.
 * `CustomCapabilityReleaseGuard` runs before the pipes and before any body has
 * been parsed, so it has nothing to decide with; the decision belongs to
 * `GrantScopeReleaseGate`, applied inside `ResolveSecureLink` and
 * `ReauthorizeSecureGrant` — the two places every one of these operations
 * passes through.
 *
 * The evidence pair is here for the same reason as the resolver, not as a
 * convenience: `APP12-B04` §22 requires the `FULL` obligation to reuse the
 * delivered attempt-scoped evidence lane rather than publishing a fourth
 * payment operation, so that lane must admit an `ORDER_ACCESS` caller in Wave 1
 * while still refusing every `REQUEST_ACCESS` one. Their route prefix still
 * reads `deposit` because renaming it would reissue two accepted operation ids
 * for a naming decision; what they are is attempt-scoped, which is what
 * `IMP-D055` made them.
 *
 * ## This set is not an exemption
 *
 * A scope-gated operation is **not** released. With Wave 2 unreleased, every
 * custom capability behind these three is refused exactly as before — the
 * refusal simply happens one layer in, and it is the indistinguishable
 * `SECURE_LINK_UNAVAILABLE` rather than the guard's generic 404, which is
 * stronger: a valid custom link must not be distinguishable from a fictional
 * one while its wave is withheld.
 */
export const SCOPE_GATED_PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  'publicSecureLink_resolve',
  'publicOrderDepositEvidence_upload',
  'publicOrderDepositEvidence_status',
]);

/**
 * The delivered rule for the obligation `APP12-G02` recorded against
 * `APP12-B04`, kept where the classification is written.
 */
export const SECURE_LINK_SCOPE_RULE = {
  operationId: 'publicSecureLink_resolve',
  deliveredBy: 'APP12-B04',
  authority: 'docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md §3.2',
  rule: 'GATE_BY_SCOPE_KIND',
  allowedInWave1: 'ORDER_ACCESS',
  withheldUntilWave2: 'REQUEST_ACCESS',
} as const;

/**
 * Whether an operation is withheld while Wave 2 is unreleased.
 *
 * Unclassified ids answer `false` on purpose. Every `admin*`, `staff*` and
 * `health*` operation reaches this function, and none of them is customer-facing
 * release surface: Admin is governed by staff authentication (§5) and health
 * must stay healthy in both release states (§17).
 *
 * The three {@link SCOPE_GATED_PUBLIC_OPERATIONS} answer `false` too, and that
 * is the whole point of the set: the guard must let them run so the grant can be
 * resolved, and `GrantScopeReleaseGate` then refuses the withheld scope. They
 * are absent from `WAVE2_WITHHELD_PUBLIC_OPERATIONS` for that reason, not
 * because they were released.
 */
export function isWave2WithheldOperation(operationId: string): boolean {
  return WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(operationId);
}

/**
 * The Wave-2 public operation matrix (`APP12-G02`).
 *
 * This file is the **runtime transcription** of
 * `docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md` §3 and §7. The authority
 * document classified all **43** public OpenAPI operations mechanically: **31**
 * `DENY` in Wave 1 and **12** `ALLOW`. Both sets are written out here in full
 * rather than derived from a prefix, because a prefix rule is exactly how
 * `publicProductPlacement_get` (custom) and `publicProduct_detail` (Wave-1
 * catalog) end up on the same side of a gate.
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
 * therefore denies Wave 1 (§3.1). Listing both sets lets one test assert that
 * the union is exactly the 43 public operations the contract publishes, so an
 * operation added by a later checkpoint cannot slip through unclassified.
 */

/**
 * The 31 withheld operations, grouped as §3 groups them.
 *
 * Wave 1 releases none of these. Each group's membership is a product fact
 * recorded in the authority document, not a judgement made here.
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

  // The custom DEPOSIT payment family and its transfer evidence (§3.4).
  // Ready-Made is PAYMENT_KIND = FULL and has no deposit; APP12-B04 composes
  // that surface as new operations rather than reusing these.
  'publicOrderDeposit_current',
  'publicOrderDeposit_qr',
  'publicOrderDeposit_initiate',
  'publicOrderDepositEvidence_upload',
  'publicOrderDepositEvidence_status',

  // The custom REMAINING payment family (§3.4).
  'publicOrderFinalPayment_current',
  'publicOrderFinalPayment_qr',
  'publicOrderFinalPayment_initiate',

  // The customer shipping-fee acknowledgement (§3.4). Ready-Made freezes an
  // Admin-set fee *before* payment, so there is nothing for the customer to
  // acknowledge afterwards.
  'publicOrderShippingFee_acknowledge',

  // Secure-link resolution (§3.2). See SECURE_LINK_REOPEN_OBLIGATION below —
  // this is the one entry that is temporary by construction.
  'publicSecureLink_resolve',
]);

/**
 * The 12 released public operations.
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

  // Public gallery reads.
  'publicGalleryEntry_list',
  'publicGalleryEntry_detail',
  'publicGalleryEntry_asset',

  // The sitemap inventory behind /sitemap.xml.
  'publicSitemapEntry_list',

  // Contact verification — the shared identity primitive (§3.1).
  'publicVerification_issue',
  'publicVerification_resend',
  'publicVerification_submitAttempt',
  'publicVerification_readStatus',
]);

/**
 * `APP12-B04`'s standing obligation, recorded where the denial is written.
 *
 * `publicSecureLink_resolve` is withheld as a **whole operation** today because
 * `SecureLinkResolutionResponse` returns `customRequestId` and a `scopeKind`
 * enum whose only member is `REQUEST_ACCESS`: the operation has no Wave-1 caller
 * and no Ready-Made scope, so there is nothing in it to keep open. That stops
 * being true the moment `APP12-B04` introduces `ORDER_ACCESS`.
 *
 * ```text
 * now (before DB01/B04):  publicSecureLink_resolve = DENY, whole operation
 * after B04 ships:        gate by scopeKind, not by operation
 *                         ORDER_ACCESS   = ALLOW  in Wave 1
 *                         REQUEST_ACCESS = DENY   until Wave 2
 * ```
 *
 * `APP12-B04` **must** perform that conversion. A whole-operation denial written
 * here and never revisited would leave `/truy-cap/don-hang` unable to resolve
 * its own link, and the Wave-1 order surface would break at `APP12-S03` — for a
 * reason that looks nothing like this file.
 */
export const SECURE_LINK_REOPEN_OBLIGATION = {
  operationId: 'publicSecureLink_resolve',
  owner: 'APP12-B04',
  authority: 'docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md §3.2',
  currentRule: 'DENY_WHOLE_OPERATION',
  requiredRule: 'GATE_BY_SCOPE_KIND',
} as const;

/**
 * Whether an operation is withheld while Wave 2 is unreleased.
 *
 * Unclassified ids answer `false` on purpose. Every `admin*`, `staff*` and
 * `health*` operation reaches this function, and none of them is customer-facing
 * release surface: Admin is governed by staff authentication (§5) and health
 * must stay healthy in both release states (§17).
 */
export function isWave2WithheldOperation(operationId: string): boolean {
  return WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(operationId);
}

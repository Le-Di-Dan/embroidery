/**
 * Every user-facing string on the Admin SKU stock workspace, transcribed from
 * the approved `APP8-D01` frames (`775:3`, `775:101`, `776:3`, `776:54`,
 * `776:142`, `777:3` … `777:125`) and the shared inventory refusal catalog
 * (`787:94`).
 *
 * Copy lives here rather than inline because CLAUDE.md §5 forbids hard-coded
 * user-facing text in components, and because the refusal wording is the part
 * of this screen a reviewer has to be able to check against `787:94` without
 * reading JSX.
 *
 * Two rules the catalog fixes and this module keeps:
 *
 * - **no raw backend code is ever the only copy.** Each refusal has a
 *   Vietnamese title and an action sentence; the technical code travels as an
 *   engineer-facing annotation inside the body sentence, exactly as `787:94`
 *   draws it.
 * - **no invented capability.** There is no "load more", no threshold editor,
 *   no absolute overwrite and no automatic retry anywhere in this vocabulary,
 *   because `APP8-B01` publishes no operation for any of them.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `skuStock`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const skuStockMessage = messageView(VI_MESSAGES.admin, 'skuStock');

export const SKU_STOCK_COPY = {
  page: {
    breadcrumb: skuStockMessage.text('page.breadcrumb'),
    title: skuStockMessage.text('page.title'),
    source: skuStockMessage.text('page.source'),
    skuLabel: skuStockMessage.text('page.skuLabel'),
    identifiers: (skuId: string, skuStockId: string) =>
      skuStockMessage.text('page.identifiers', { skuId, skuStockId }),
    adjust: skuStockMessage.text('page.adjust'),
    loading: skuStockMessage.text('page.loading'),
  },
  pill: {
    healthy: skuStockMessage.text('pill.healthy'),
    lowStock: skuStockMessage.text('pill.lowStock'),
  },
  metrics: {
    onHand: skuStockMessage.text('metrics.onHand'),
    onHandNote: skuStockMessage.text('metrics.onHandNote'),
    held: skuStockMessage.text('metrics.held'),
    heldNote: skuStockMessage.text('metrics.heldNote'),
    reserved: skuStockMessage.text('metrics.reserved'),
    reservedNote: skuStockMessage.text('metrics.reservedNote'),
    available: skuStockMessage.text('metrics.available'),
    availableNote: skuStockMessage.text('metrics.availableNote'),
  },
  threshold: {
    /** `775:155` — the flag is on, so the configured threshold is named. */
    lowStockTitle: (threshold: number) =>
      skuStockMessage.text('threshold.lowStockTitle', { threshold }),
    lowStockBody: skuStockMessage.text('threshold.lowStockBody'),
    /** `775:57` — a threshold exists and the flag is off. */
    configured: (threshold: number) => skuStockMessage.text('threshold.configured', { threshold }),
    /** `776:53` — no threshold at all. Nothing is inferred from the quantity. */
    absent: skuStockMessage.text('threshold.absent'),
  },
  ledger: {
    title: skuStockMessage.text('ledger.title'),
    bound: skuStockMessage.text('ledger.bound'),
    source: skuStockMessage.text('ledger.source'),
    columns: {
      entryKind: skuStockMessage.text('ledger.columns.entryKind'),
      quantity: skuStockMessage.text('ledger.columns.quantity'),
      onHandDelta: skuStockMessage.text('ledger.columns.onHandDelta'),
      reason: skuStockMessage.text('ledger.columns.reason'),
      occurredAt: skuStockMessage.text('ledger.columns.occurredAt'),
    },
    /** A movement that carries no reason. Absent is not empty and not unknown. */
    noReason: skuStockMessage.text('ledger.noReason'),
    truncatedTitle: skuStockMessage.text('ledger.truncatedTitle'),
    truncatedBody: skuStockMessage.text('ledger.truncatedBody'),
    failureTitle: skuStockMessage.text('ledger.failureTitle'),
    failureBody: skuStockMessage.text('ledger.failureBody'),
    retry: skuStockMessage.text('ledger.retry'),
  },
  newAnchor: {
    lead: (skuId: string) => skuStockMessage.text('newAnchor.lead', { skuId }),
    title: skuStockMessage.text('newAnchor.title'),
    body: skuStockMessage.text('newAnchor.body'),
  },
  failure: {
    /** `776:168` — INVENTORY_SKU_NOT_FOUND. */
    missingTitle: skuStockMessage.text('failure.missingTitle'),
    missingBody: skuStockMessage.text('failure.missingBody'),
    backToCatalog: skuStockMessage.text('failure.backToCatalog'),
    /** `776:176` — anything the platform answers with a sanitised 5xx. */
    retryTitle: skuStockMessage.text('failure.retryTitle'),
    retryBody: skuStockMessage.text('failure.retryBody'),
    reload: skuStockMessage.text('failure.reload'),
    retry: skuStockMessage.text('failure.retry'),
    /** `776:182` — the Admin session died. */
    unauthenticatedTitle: skuStockMessage.text('failure.unauthenticatedTitle'),
    unauthenticatedBody: skuStockMessage.text('failure.unauthenticatedBody'),
    signIn: skuStockMessage.text('failure.signIn'),
    /** `787:134` — the write reached the API from a source it does not accept. */
    forbiddenTitle: skuStockMessage.text('failure.forbiddenTitle'),
    forbiddenBody: skuStockMessage.text('failure.forbiddenBody'),
  },
  adjust: {
    title: skuStockMessage.text('adjust.title'),
    context: (skuId: string, onHand: number, available: number) =>
      skuStockMessage.text('adjust.context', { skuId, onHand, available }),
    deltaLabel: skuStockMessage.text('adjust.deltaLabel'),
    deltaHelp: skuStockMessage.text('adjust.deltaHelp'),
    reasonLabel: skuStockMessage.text('adjust.reasonLabel'),
    reasonHelp: skuStockMessage.text('adjust.reasonHelp'),
    consequenceTitle: skuStockMessage.text('adjust.consequenceTitle'),
    consequenceBody: skuStockMessage.text('adjust.consequenceBody'),
    previewTitle: skuStockMessage.text('adjust.previewTitle'),
    previewBody: (
      onHandBefore: number,
      onHandAfter: number,
      availableBefore: number,
      availableAfter: number,
    ) =>
      skuStockMessage.text('adjust.previewBody', {
        onHandBefore,
        onHandAfter,
        availableBefore,
        availableAfter,
      }),
    cancel: skuStockMessage.text('adjust.cancel'),
    submit: skuStockMessage.text('adjust.submit'),
    submitting: skuStockMessage.text('adjust.submitting'),
    close: skuStockMessage.text('adjust.close'),
  },
  validation: {
    blockedTitle: skuStockMessage.text('validation.blockedTitle'),
    blockedBody: skuStockMessage.text('validation.blockedBody'),
    deltaRequired: skuStockMessage.text('validation.deltaRequired'),
    deltaNotInteger: skuStockMessage.text('validation.deltaNotInteger'),
    deltaZero: skuStockMessage.text('validation.deltaZero'),
    deltaOutOfRange: skuStockMessage.text('validation.deltaOutOfRange'),
    reasonRequired: skuStockMessage.text('validation.reasonRequired'),
    reasonTooLong: skuStockMessage.text('validation.reasonTooLong'),
  },
  submitting: {
    context: (skuId: string) => skuStockMessage.text('submitting.context', { skuId }),
    title: skuStockMessage.text('submitting.title'),
    body: skuStockMessage.text('submitting.body'),
  },
  success: {
    title: skuStockMessage.text('success.title'),
    context: (skuId: string) => skuStockMessage.text('success.context', { skuId }),
    noteTitle: skuStockMessage.text('success.noteTitle'),
    noteBody: (
      onHandBefore: number,
      onHandAfter: number,
      availableBefore: number,
      availableAfter: number,
    ) =>
      skuStockMessage.text('success.noteBody', {
        onHandBefore,
        onHandAfter,
        availableBefore,
        availableAfter,
      }),
    ledgerTitle: skuStockMessage.text('success.ledgerTitle'),
    ledgerBody: skuStockMessage.text('success.ledgerBody'),
    viewLedger: skuStockMessage.text('success.viewLedger'),
  },
  refusal: {
    /** `777:99` / `787:104` — INVENTORY_STOCK_WOULD_GO_NEGATIVE. */
    negativeHeading: skuStockMessage.text('refusal.negativeHeading'),
    negativeContext: (skuId: string, onHand: number) =>
      skuStockMessage.text('refusal.negativeContext', { skuId, onHand }),
    negativeTitle: skuStockMessage.text('refusal.negativeTitle'),
    negativeBody: (onHand: number, delta: number, resulting: string) =>
      skuStockMessage.text('refusal.negativeBody', {
        onHand,
        // The movement, named for its direction. Two keys rather than one
        // sentence with a sign in it: "giảm 3" and "thay đổi -3" are different
        // Vietnamese, and a translator must be able to move the number inside
        // each of them independently (§5A.5).
        movement:
          delta < 0
            ? skuStockMessage.text('refusal.decreaseBy', { amount: Math.abs(delta) })
            : skuStockMessage.text('refusal.changeBy', { amount: delta }),
        resulting,
      }),
    overrideTitle: skuStockMessage.text('refusal.overrideTitle'),
    overrideBody: skuStockMessage.text('refusal.overrideBody'),
    editDelta: skuStockMessage.text('refusal.editDelta'),
    /** `787:110` — the SKU disappeared underneath the open dialog. */
    missingTitle: skuStockMessage.text('refusal.missingTitle'),
    missingBody: skuStockMessage.text('refusal.missingBody'),
    /** `787:128` / `787:134`. */
    unauthenticatedTitle: skuStockMessage.text('refusal.unauthenticatedTitle'),
    unauthenticatedBody: skuStockMessage.text('refusal.unauthenticatedBody'),
    forbiddenTitle: skuStockMessage.text('refusal.forbiddenTitle'),
    forbiddenBody: skuStockMessage.text('refusal.forbiddenBody'),
    /** `787:140` — the sanitised platform 5xx. */
    serverTitle: skuStockMessage.text('refusal.serverTitle'),
    serverBody: skuStockMessage.text('refusal.serverBody'),
    /**
     * `777:75` — the transport failed with no response line, so whether the
     * server committed is unknown. Never reported as a failure and never
     * resubmitted.
     */
    ambiguousTitle: skuStockMessage.text('refusal.ambiguousTitle'),
    ambiguousBody: skuStockMessage.text('refusal.ambiguousBody'),
  },
} as const;

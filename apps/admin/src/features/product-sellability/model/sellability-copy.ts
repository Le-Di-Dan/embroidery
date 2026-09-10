/**
 * Vietnamese copy view for the Ready-Made sellability authoring section
 * (`APP12-N02.A01`), transcribed from the approved `APP12-N02.D01` frames under
 * `FIG-APPROVAL-APP12-N02-D01-PO-001`.
 *
 * Every sentence lives in `packages/i18n/messages/vi/admin.json` under
 * `productSellability`. What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold.
 *
 * Three rules govern what may appear here, and each is a decision the design
 * made rather than a style preference.
 *
 * *No refusal echoes the server.* Every operator-facing failure string below is
 * written against a classified outcome, never against `normalized.message`, a
 * business code, a SQLSTATE or a constraint name. The server's prose is not
 * copy and never reaches a browser through this module.
 *
 * *Structural unsellability is never called `hết hàng`.* They are different
 * facts with different repairs — one is "no SKU exists to sell", the other is
 * "a selling SKU has 0 on hand" — and the two places an operator could most
 * easily confuse them (the warning banner and the last-SKU confirmation) say so
 * in their own sentence rather than leaving it to be inferred.
 *
 * *Nothing describes deactivation as deletion.* The contract publishes no
 * delete for a variant or a SKU, so no string here offers, implies or warns
 * about one.
 *
 * The placeholder-bearing keys are exposed as **functions** rather than
 * constants: the value is a SKU code or a variant title that only exists at
 * render time, and a constant would have to be assembled by concatenation at
 * the call site — which is exactly the second copy authority §5A forbids.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

const sellability = messageView(VI_MESSAGES.admin, 'productSellability');

export const SELLABILITY_COPY = {
  section: {
    title: sellability.text('section.title'),
    /**
     * The section has a different save model from the form it sits inside —
     * dialogs commit immediately, the header's save button does not touch a
     * variant. A screen with two save models that does not say which is which
     * is a defect waiting to be filed (`D01` §D).
     */
    help: sellability.text('section.help'),
    loading: sellability.text('section.loading'),
    emptyTitle: sellability.text('section.emptyTitle'),
    emptyBody: sellability.text('section.emptyBody'),
    addVariant: sellability.text('section.addVariant'),
    failureTitle: sellability.text('section.failureTitle'),
    failureBody: sellability.text('section.failureBody'),
    retry: sellability.text('section.retry'),
    variantCount: (count: number) => sellability.text('section.variantCount', { count }),
  },

  variant: {
    activeBadge: sellability.text('variant.activeBadge'),
    inactiveBadge: sellability.text('variant.inactiveBadge'),
    /**
     * The collapsed row's sellability truth. A variant's order-eligible SKU is
     * the one fact that decides whether the variant can be bought, so it is on
     * the row rather than behind the disclosure — nothing important hides
     * behind a click (`D01` §D).
     */
    orderEligibleSku: (code: string) => sellability.text('variant.orderEligibleSku', { code }),
    noOrderEligibleSku: sellability.text('variant.noOrderEligibleSku'),
    skuCount: (count: number) => sellability.text('variant.skuCount', { count }),
    expand: sellability.text('variant.expand'),
    collapse: sellability.text('variant.collapse'),
    edit: sellability.text('variant.edit'),
    deactivate: sellability.text('variant.deactivate'),
    reactivate: sellability.text('variant.reactivate'),
    skusHeading: sellability.text('variant.skusHeading'),
    noSkus: sellability.text('variant.noSkus'),
    addSku: sellability.text('variant.addSku'),
    /**
     * The accessible names, which name their subject where the visible label
     * cannot (`APP12-N02.A01` live run).
     *
     * An expanded variant card holds a `Sửa` on its own header and a `Sửa` on
     * every SKU beneath it. Sighted operators tell them apart by position; in
     * the accessibility tree they were three identically named buttons in one
     * region, which is exactly the ambiguity a screen-reader user cannot
     * resolve. The visible text stays short — the design's, unchanged — and the
     * name carries the subject.
     */
    expandLabel: (variant: string) => sellability.text('variant.expandLabel', { variant }),
    collapseLabel: (variant: string) => sellability.text('variant.collapseLabel', { variant }),
    editLabel: (variant: string) => sellability.text('variant.editLabel', { variant }),
    deactivateLabel: (variant: string) => sellability.text('variant.deactivateLabel', { variant }),
    reactivateLabel: (variant: string) => sellability.text('variant.reactivateLabel', { variant }),
    addSkuLabel: (variant: string) => sellability.text('variant.addSkuLabel', { variant }),
  },

  sku: {
    activeBadge: sellability.text('sku.activeBadge'),
    inactiveBadge: sellability.text('sku.inactiveBadge'),
    /**
     * The resolved effective price, repeated on the row so an operator
     * scanning the list never opens a dialog to learn what a SKU sells for.
     * Inheritance and override are different sentences, not one field that
     * happens to be empty.
     */
    inheritedPrice: (price: string) => sellability.text('sku.inheritedPrice', { price }),
    overridePrice: (price: string) => sellability.text('sku.overridePrice', { price }),
    /** Override `"0"` or an unset base price — the `SKU_PRICE_RESOLVABLE` failure, stated on the row. */
    unresolvablePrice: sellability.text('sku.unresolvablePrice'),
    manageStock: sellability.text('sku.manageStock'),
    /** The accessible name, which names the SKU the link leads to. */
    manageStockLabel: (code: string) => sellability.text('sku.manageStockLabel', { code }),
    edit: sellability.text('sku.edit'),
    deactivate: sellability.text('sku.deactivate'),
    reactivate: sellability.text('sku.reactivate'),
    /** The same disambiguation as the variant row's, for the same reason. */
    editLabel: (code: string) => sellability.text('sku.editLabel', { code }),
    deactivateLabel: (code: string) => sellability.text('sku.deactivateLabel', { code }),
    reactivateLabel: (code: string) => sellability.text('sku.reactivateLabel', { code }),
  },

  variantDialog: {
    createTitle: sellability.text('variantDialog.createTitle'),
    editTitle: sellability.text('variantDialog.editTitle'),
    createSubtitle: sellability.text('variantDialog.createSubtitle'),
    editSubtitle: (variant: string) => sellability.text('variantDialog.editSubtitle', { variant }),
    colorLabel: sellability.text('variantDialog.colorLabel'),
    sizeLabel: sellability.text('variantDialog.sizeLabel'),
    optionalHint: sellability.text('variantDialog.optionalHint'),
    activeLabel: sellability.text('variantDialog.activeLabel'),
    nextStep: sellability.text('variantDialog.nextStep'),
    submitCreate: sellability.text('variantDialog.submitCreate'),
    submitEdit: sellability.text('variantDialog.submitEdit'),
    submitting: sellability.text('variantDialog.submitting'),
    cancel: sellability.text('variantDialog.cancel'),
  },

  skuDialog: {
    createTitle: sellability.text('skuDialog.createTitle'),
    editTitle: sellability.text('skuDialog.editTitle'),
    subtitle: (variant: string) => sellability.text('skuDialog.subtitle', { variant }),
    codeLabel: sellability.text('skuDialog.codeLabel'),
    codeHint: sellability.text('skuDialog.codeHint'),
    priceModeLabel: sellability.text('skuDialog.priceModeLabel'),
    /** The inheritance option names the amount it inherits, so the choice is legible. */
    priceInherit: (price: string) => sellability.text('skuDialog.priceInherit', { price }),
    /** The product has no base price yet: inheritance is still offered, but not as a number. */
    priceInheritUnset: sellability.text('skuDialog.priceInheritUnset'),
    priceOverride: sellability.text('skuDialog.priceOverride'),
    priceOverrideLabel: sellability.text('skuDialog.priceOverrideLabel'),
    priceOverrideHint: sellability.text('skuDialog.priceOverrideHint'),
    activeLabel: sellability.text('skuDialog.activeLabel'),
    activeHint: sellability.text('skuDialog.activeHint'),
    /** States the truth about a new SKU's stock, so no operator infers a publication dependency. */
    stockNote: sellability.text('skuDialog.stockNote'),
    submitCreate: sellability.text('skuDialog.submitCreate'),
    submitEdit: sellability.text('skuDialog.submitEdit'),
    submitting: sellability.text('skuDialog.submitting'),
    cancel: sellability.text('skuDialog.cancel'),
  },

  variantDeactivate: {
    title: sellability.text('variantDeactivate.title'),
    subtitle: (variant: string) => sellability.text('variantDeactivate.subtitle', { variant }),
    body: sellability.text('variantDeactivate.body'),
    arithmetic: sellability.text('variantDeactivate.arithmetic'),
    consequence: sellability.text('variantDeactivate.consequence'),
    remainsPublished: sellability.text('variantDeactivate.remainsPublished'),
    notSoldOut: sellability.text('variantDeactivate.notSoldOut'),
    keep: sellability.text('variantDeactivate.keep'),
    confirm: sellability.text('variantDeactivate.confirm'),
  },

  skuDeactivate: {
    title: sellability.text('skuDeactivate.title'),
    subtitle: (code: string) => sellability.text('skuDeactivate.subtitle', { code }),
    body: sellability.text('skuDeactivate.body'),
    arithmetic: sellability.text('skuDeactivate.arithmetic'),
    consequence: sellability.text('skuDeactivate.consequence'),
    remainsPublished: sellability.text('skuDeactivate.remainsPublished'),
    notSoldOut: sellability.text('skuDeactivate.notSoldOut'),
    keep: sellability.text('skuDeactivate.keep'),
    confirm: sellability.text('skuDeactivate.confirm'),
  },

  warning: {
    badge: sellability.text('warning.badge'),
    title: sellability.text('warning.title'),
    evidenceHeading: sellability.text('warning.evidenceHeading'),
    activeVariantCount: (count: number) =>
      sellability.text('warning.activeVariantCount', { count }),
    orderEligibleSkuCount: (count: number) =>
      sellability.text('warning.orderEligibleSkuCount', { count }),
    notSoldOut: sellability.text('warning.notSoldOut'),
    toSection: sellability.text('warning.toSection'),
    toReadiness: sellability.text('warning.toReadiness'),
  },

  validation: {
    labelRequired: sellability.text('validation.labelRequired'),
    codeRequired: sellability.text('validation.codeRequired'),
    priceRequired: sellability.text('validation.priceRequired'),
    priceInvalid: sellability.text('validation.priceInvalid'),
  },
} as const;

/**
 * Operator-facing outcomes, keyed by the classification in
 * `sellability-failure`. Every one is safe to render: none echoes a server
 * message, a domain code, a request id or a token.
 *
 * `skuAmbiguous` is absent from this record and lives on its own below,
 * because it is the only refusal that is not a title/body pair — it names the
 * SKU already selling and carries two numbered recoveries, one of which is a
 * legitimate alternative rather than a repair.
 */
export const SELLABILITY_FAILURE_COPY = {
  labelRequired: sellability.group<{ title: string; body: string }>('failure.labelRequired'),
  duplicate: sellability.group<{ title: string; body: string }>('failure.duplicate'),
  notAuthorable: sellability.group<{ title: string; body: string }>('failure.notAuthorable'),
  variantMissing: sellability.group<{ title: string; body: string }>('failure.variantMissing'),
  skuCodeConflict: sellability.group<{ title: string; body: string }>('failure.skuCodeConflict'),
  skuMissing: sellability.group<{ title: string; body: string }>('failure.skuMissing'),
  invalid: sellability.group<{ title: string; body: string }>('failure.invalid'),
  unauthenticated: sellability.group<{ title: string; body: string }>('failure.unauthenticated'),
  forbidden: sellability.group<{ title: string; body: string }>('failure.forbidden'),
  retryable: sellability.group<{ title: string; body: string }>('failure.retryable'),
} as const;

/**
 * The `SKU_ORDER_ELIGIBLE_AMBIGUOUS` refusal (`976:269`).
 *
 * It states the offending SKU, numbers the two steps that resolve it, says in
 * its own sentence that the system will **not** deactivate the old SKU for the
 * operator, and offers the second legitimate path — create the SKU inactive
 * now. Nothing here is a retry: the write was refused, nothing was written, and
 * an automatic second attempt would be the system making the decision the
 * operator has to make.
 */
export const SKU_AMBIGUOUS_COPY = {
  title: sellability.text('failure.skuAmbiguous.title'),
  body: (code: string) => sellability.text('failure.skuAmbiguous.body', { code }),
  recoveryHeading: sellability.text('failure.skuAmbiguous.recoveryHeading'),
  recoveryFirst: (code: string) => sellability.text('failure.skuAmbiguous.recoveryFirst', { code }),
  recoverySecond: sellability.text('failure.skuAmbiguous.recoverySecond'),
  noAutoDeactivate: sellability.text('failure.skuAmbiguous.noAutoDeactivate'),
  alternative: sellability.text('failure.skuAmbiguous.alternative'),
} as const;

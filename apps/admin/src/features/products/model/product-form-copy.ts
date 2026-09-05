/**
 * Vietnamese copy catalog for the Admin product form/detail (`APP2-A03`).
 *
 * Every string that appears in an approved node is reproduced verbatim from
 * `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-{DEFAULT,VALIDATION,SAVING}` (`434:20`,
 * `436:37`, `436:140`), `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` (`437:73`),
 * `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT` (`438:90`) and the normative handoff
 * `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` (`521:284`), approved under
 * `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`.
 *
 * Create mode reuses the edit shell with fewer groups, exactly as the handoff
 * specifies, so its labels live beside the edit labels rather than in a second
 * catalog.
 *
 * Deliberately absent: `Phiên bản`, `SKU`, `Điều kiện xuất bản`, `Tới bước xuất
 * bản`, `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ`, `Xoá`. Those capabilities do not
 * exist in `APP2-B02`, so the words for them must not exist here either.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { ProductSaveFailure } from './product-conflict';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `productSaveFailure`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productSaveFailureMessage = messageView(VI_MESSAGES.admin, 'productSaveFailure');

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `productForm`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productFormMessage = messageView(VI_MESSAGES.admin, 'productForm');

export const PRODUCT_FORM_COPY = {
  create: {
    title: productFormMessage.text('create.title'),
    subtitle: productFormMessage.text('create.subtitle'),
    submit: productFormMessage.text('create.submit'),
    cancel: productFormMessage.text('create.cancel'),
    submitting: productFormMessage.text('create.submitting'),
    created: productFormMessage.text('create.created'),
    failedTitle: productFormMessage.text('create.failedTitle'),
    failedBody: productFormMessage.text('create.failedBody'),
  },

  edit: {
    subtitle: productFormMessage.text('edit.subtitle'),
    subtitleNarrow: productFormMessage.text('edit.subtitleNarrow'),
    save: productFormMessage.text('edit.save'),
    cancel: productFormMessage.text('edit.cancel'),
    saving: productFormMessage.text('edit.saving'),
    savingTitle: productFormMessage.text('edit.savingTitle'),
    savingHelp: productFormMessage.text('edit.savingHelp'),
    saveFailedTitle: productFormMessage.text('edit.saveFailedTitle'),
    saveFailedBody: productFormMessage.text('edit.saveFailedBody'),
    /** The mobile frame's closing note; a boundary statement, not a control. */
    savePublishNote: productFormMessage.text('edit.savePublishNote'),
  },

  detail: {
    loading: productFormMessage.text('detail.loading'),
    notFoundTitle: productFormMessage.text('detail.notFoundTitle'),
    notFoundBody: productFormMessage.text('detail.notFoundBody'),
    notEditableTitle: productFormMessage.text('detail.notEditableTitle'),
    notEditableBody: productFormMessage.text('detail.notEditableBody'),
    unavailableTitle: productFormMessage.text('detail.unavailableTitle'),
    unavailableBody: productFormMessage.text('detail.unavailableBody'),
    retry: productFormMessage.text('detail.retry'),
    backToList: productFormMessage.text('detail.backToList'),
  },

  groups: {
    basic: productFormMessage.text('groups.basic'),
    category: productFormMessage.text('groups.category'),
    price: productFormMessage.text('groups.price'),
    media: productFormMessage.text('groups.media'),
    /** The mobile frame merges the last three groups into one card. */
    categoryPriceMedia: productFormMessage.text('groups.categoryPriceMedia'),
  },

  fields: {
    nameLabel: productFormMessage.text('fields.nameLabel'),
    nameHelp: productFormMessage.text('fields.nameHelp'),
    namePlaceholder: productFormMessage.text('fields.namePlaceholder'),
    descriptionLabel: productFormMessage.text('fields.descriptionLabel'),
    descriptionHelp: productFormMessage.text('fields.descriptionHelp'),
    categoryLabel: productFormMessage.text('fields.categoryLabel'),
    categoryHelp: productFormMessage.text('fields.categoryHelp'),
    categoryPlaceholder: productFormMessage.text('fields.categoryPlaceholder'),
    /**
     * The product's category is no longer assignable (`APP12-A01`).
     *
     * Shown when the category a product is already filed under has since been
     * drafted back or archived, so it is not among the options. The real name
     * is interpolated — the record has a category, and denying it with
     * `Không xác định`, or quietly moving the product to another one, would
     * both be lies. Reassignment is the operator's, through this same select.
     */
    categoryUnassignable: (name: string): string =>
      productFormMessage.text('fields.categoryUnassignable', { name }),
    /** The same situation when the inventory has no row for the stored slug at all. */
    categoryMissing: productFormMessage.text('fields.categoryMissing'),
    priceLabel: productFormMessage.text('fields.priceLabel'),
    priceHelp: productFormMessage.text('fields.priceHelp'),
  },

  validation: {
    summaryTitle: productFormMessage.text('validation.summaryTitle'),
    createSummaryTitle: productFormMessage.text('validation.createSummaryTitle'),
    nameRequired: productFormMessage.text('validation.nameRequired'),
    categoryRequired: productFormMessage.text('validation.categoryRequired'),
    priceInvalid: productFormMessage.text('validation.priceInvalid'),
  },

  status: {
    cardTitle: productFormMessage.text('status.cardTitle'),
    draftNote: productFormMessage.text('status.draftNote'),
  },

  slug: {
    cardTitle: productFormMessage.text('slug.cardTitle'),
    note: productFormMessage.text('slug.note'),
    /** The mobile frame states path and immutability on one line. */
    inlinePrefix: productFormMessage.text('slug.inlinePrefix'),
    inlineSuffix: productFormMessage.text('slug.inlineSuffix'),
  },

  media: {
    pick: productFormMessage.text('media.pick'),
    help: productFormMessage.text('media.help'),
    helpNarrow: productFormMessage.text('media.helpNarrow'),
    roleThumbnail: productFormMessage.text('media.roleThumbnail'),
    roleGallery: productFormMessage.text('media.roleGallery'),
    moveEarlier: productFormMessage.text('media.moveEarlier'),
    moveLater: productFormMessage.text('media.moveLater'),
    remove: productFormMessage.text('media.remove'),
    empty: productFormMessage.text('media.empty'),
    listLabel: productFormMessage.text('media.listLabel'),
    /** Announced after a keyboard reorder so the new position is perceivable. */
    reordered: productFormMessage.text('media.reordered'),
    removed: productFormMessage.text('media.removed'),
  },

  picker: {
    title: productFormMessage.text('picker.title'),
    help: productFormMessage.text('picker.help'),
    close: productFormMessage.text('picker.close'),
    confirm: productFormMessage.text('picker.confirm'),
    cancel: productFormMessage.text('picker.cancel'),
    statusReady: productFormMessage.text('picker.statusReady'),
    loading: productFormMessage.text('picker.loading'),
    emptyTitle: productFormMessage.text('picker.emptyTitle'),
    emptyBody: productFormMessage.text('picker.emptyBody'),
    unavailableTitle: productFormMessage.text('picker.unavailableTitle'),
    unavailableBody: productFormMessage.text('picker.unavailableBody'),
    retry: productFormMessage.text('picker.retry'),
    loadMore: productFormMessage.text('picker.loadMore'),
    loadingMore: productFormMessage.text('picker.loadingMore'),
    loadMoreFailed: productFormMessage.text('picker.loadMoreFailed'),
    /** Rendered with the selected count; the contract exposes no total. */
    selectionCount: (count: number) => productFormMessage.text('picker.selectionCount', { count }),
  },

  conflict: {
    title: productFormMessage.text('conflict.title'),
    body: productFormMessage.text('conflict.body'),
    reload: productFormMessage.text('conflict.reload'),
    close: productFormMessage.text('conflict.close'),
  },

  unsaved: {
    title: productFormMessage.text('unsaved.title'),
    body: productFormMessage.text('unsaved.body'),
    leave: productFormMessage.text('unsaved.leave'),
    stay: productFormMessage.text('unsaved.stay'),
  },

  identity: {
    titlePng: productFormMessage.text('identity.titlePng'),
    titleJpeg: productFormMessage.text('identity.titleJpeg'),
    titleWebp: productFormMessage.text('identity.titleWebp'),
    titleUnknown: productFormMessage.text('identity.titleUnknown'),
    unitBytes: productFormMessage.text('identity.unitBytes'),
    unitKilobytes: productFormMessage.text('identity.unitKilobytes'),
    unitMegabytes: productFormMessage.text('identity.unitMegabytes'),
    metaUnavailable: productFormMessage.text('identity.metaUnavailable'),
    /** There is no media-delivery contract, so no tile ever shows real pixels. */
  },
} as const;

/**
 * What a failed save is allowed to say, per classified outcome.
 *
 * The screen never renders a server message, so anything it cannot name falls
 * back to the generic pair rather than to whatever the backend happened to
 * return. Two outcomes get their own words because the operator's next step
 * genuinely differs: a product that left the draft state cannot be saved from
 * here at all, and an ineligible image is fixed by changing the selection.
 *
 * `version-conflict` maps to the generic pair on purpose — that outcome is
 * carried by the approved dialog, and the banner is only what remains after the
 * operator dismisses it.
 */
export const PRODUCT_SAVE_FAILURE_COPY: Readonly<
  Record<ProductSaveFailure, { readonly title: string; readonly body: string }>
> = {
  'version-conflict': {
    title: PRODUCT_FORM_COPY.edit.saveFailedTitle,
    body: PRODUCT_FORM_COPY.edit.saveFailedBody,
  },
  'not-editable': {
    title: PRODUCT_FORM_COPY.detail.notEditableTitle,
    body: PRODUCT_FORM_COPY.detail.notEditableBody,
  },
  'media-unavailable': {
    title: productSaveFailureMessage.text('media-unavailable.title'),
    body: productSaveFailureMessage.text('media-unavailable.body'),
  },
  generic: {
    title: PRODUCT_FORM_COPY.edit.saveFailedTitle,
    body: PRODUCT_FORM_COPY.edit.saveFailedBody,
  },
} as const;

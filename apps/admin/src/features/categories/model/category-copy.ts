/**
 * Every operator-visible string on the category screen (`APP12-A01`).
 *
 * ## Where each string comes from
 *
 * The screen copy is transcribed from the two approved frames — the list
 * (`FIG-APP12-A04-CATEGORY-LIST-DESKTOP`, `915:342`) and the form states
 * (`FIG-APP12-A04-CATEGORY-FORM-STATES`, `916:343`) — and each entry carries
 * the node it was read from. Nothing is written from a DTO field name, an enum
 * member or a backend message: `APP12-C02` can name a slug, a table or a UUID
 * in its own prose, and none of that belongs on an operator screen.
 *
 * Entries marked `AUTHORED` name a state the frames do not draw — the archived
 * read-only form, the concurrency conflict, the list's own loading and failure
 * states, and one message per `APP12-C02` domain code. They are written in the
 * voice the drawn refusal establishes: say what happened, then the next action,
 * never "không được" alone.
 *
 * ## No category value may ever appear here
 *
 * This module holds labels for *rules* — statuses, fields, actions, failures.
 * It holds no category name, no slug and no taxonomy, and it must never grow
 * one. `category.name` is the label authority for a category
 * (`APP12-P01` §0.0, `BR-034`), and a Vietnamese label table compiled next to
 * it is exactly what `APP12-C01-C1` removed from this app.
 */

import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `categories`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const categoriesMessage = messageView(VI_MESSAGES.admin, 'categories');

export const CATEGORY_COPY = {
  page: {
    /** `915:370` — also the sidebar entry. */
    title: categoriesMessage.text('page.title'),
    /** `915:371` */
    subtitle: categoriesMessage.text('page.subtitle'),
    /** `915:372` */
    create: categoriesMessage.text('page.create'),
    /** `915:426` */
  },
  table: {
    /** AUTHORED — the accessible name of the table, never shown visually. */
    caption: categoriesMessage.text('table.caption'),
    /** `915:376` */
    name: categoriesMessage.text('table.name'),
    /** `915:377` */
    slug: 'Slug',
    /** `915:378` */
    status: categoriesMessage.text('table.status'),
    /** `915:379` */
    publishedProducts: categoriesMessage.text('table.publishedProducts'),
    /** `915:380` */
    indexable: categoriesMessage.text('table.indexable'),
    /** `915:389` */
    indexableYes: categoriesMessage.text('table.indexableYes'),
    /** `915:407` */
    indexableNo: categoriesMessage.text('table.indexableNo'),
    /**
     * `915:416` / `915:425` — the draft and archived rows.
     *
     * Indexability is only ever acted on for a published category, so for the
     * other two states the frame shows a dash rather than a value that would
     * read as a promise the sitemap is not keeping.
     */
    indexableNotApplicable: categoriesMessage.text('table.indexableNotApplicable'),
  },
  list: {
    /** AUTHORED */
    loading: categoriesMessage.text('list.loading'),
    /** AUTHORED — the taxonomy is genuinely empty, not merely unread. */
    empty: categoriesMessage.text('list.empty'),
    /** AUTHORED */
    failed: categoriesMessage.text('list.failed'),
    /** AUTHORED */
    retry: categoriesMessage.text('list.retry'),
  },
  form: {
    /** `916:345` — create mode only; edit mode shows `category.name` (`916:392`). */
    createTitle: categoriesMessage.text('form.createTitle'),
    /** `916:350` */
    nameLabel: categoriesMessage.text('form.nameLabel'),
    /** `916:355` */
    slugLabel: categoriesMessage.text('form.slugLabel'),
    /** `916:358` */
    slugHelp: categoriesMessage.text('form.slugHelp'),
    /** `916:379` — rendered beside the label, not inside the control. */
    slugLockedChip: categoriesMessage.text('form.slugLockedChip'),
    /** `916:382` */
    slugLockedHelp: categoriesMessage.text('form.slugLockedHelp'),
    /** `916:361` */
    indexableLabel: categoriesMessage.text('form.indexableLabel'),
    /**
     * AUTHORED — the contract requires `displayOrder` on create and allows it
     * on update, and the frames draw no control for it. Written in the drawn
     * field language so it reads as one form, not as an appended extra.
     */
    displayOrderLabel: categoriesMessage.text('form.displayOrderLabel'),
    /** AUTHORED */
    displayOrderHelp: categoriesMessage.text('form.displayOrderHelp'),
    /** `916:363` */
    saveDraft: categoriesMessage.text('form.saveDraft'),
    /** `916:384` */
    save: categoriesMessage.text('form.save'),
    /** `916:365` */
    publish: categoriesMessage.text('form.publish'),
    /** `916:386` */
    archive: categoriesMessage.text('form.archive'),
    /** AUTHORED */
    cancel: categoriesMessage.text('form.cancel'),
    /** AUTHORED — announced while a write is in flight. */
    saving: categoriesMessage.text('form.saving'),
    /** AUTHORED */
    publishing: categoriesMessage.text('form.publishing'),
    /** AUTHORED */
    archiving: categoriesMessage.text('form.archiving'),
    /**
     * AUTHORED — the archived form.
     *
     * Says the record is closed and that nothing here reopens it, because the
     * contract has no relist and no restore and the operator should not go
     * looking for one.
     */
    archivedNotice: categoriesMessage.text('form.archivedNotice'),
    /** AUTHORED — announced after a successful write. */
    savedNotice: categoriesMessage.text('form.savedNotice'),
    /** AUTHORED */
    publishedNotice: categoriesMessage.text('form.publishedNotice'),
    /** AUTHORED */
    archivedDoneNotice: categoriesMessage.text('form.archivedDoneNotice'),
  },
  validation: {
    /** AUTHORED */
    nameRequired: categoriesMessage.text('validation.nameRequired'),
    /** AUTHORED */
    nameTooLong: categoriesMessage.text('validation.nameTooLong'),
    /** AUTHORED */
    slugRequired: categoriesMessage.text('validation.slugRequired'),
    /** AUTHORED */
    slugMalformed: categoriesMessage.text('validation.slugMalformed'),
    /** AUTHORED */
    slugTooLong: categoriesMessage.text('validation.slugTooLong'),
    /** AUTHORED */
    displayOrderInvalid: categoriesMessage.text('validation.displayOrderInvalid'),
    /** AUTHORED */
    displayOrderRange: categoriesMessage.text('validation.displayOrderRange'),
  },
  archiveRefusal: {
    /** `916:394` — the symbol is rendered separately and `aria-hidden`. */
    title: categoriesMessage.text('archiveRefusal.title'),
    /** `916:394` */
    symbol: categoriesMessage.text('archiveRefusal.symbol'),
    /** `916:395` — the count is the server's, re-read after the refusal. */
    body: (count: number): string => categoriesMessage.text('archiveRefusal.body', { count }),
    /** `916:396` — the safe next action: the product list, filtered to exactly those rows. */
    action: (count: number): string => categoriesMessage.text('archiveRefusal.action', { count }),
  },
  failure: {
    /** AUTHORED — one message per `APP12-C02` domain code (§12). */
    notFound: categoriesMessage.text('failure.notFound'),
    slugConflict: categoriesMessage.text('failure.slugConflict'),
    slugImmutable: categoriesMessage.text('failure.slugImmutable'),
    invalidTransition: categoriesMessage.text('failure.invalidTransition'),
    inventoryTooLarge: categoriesMessage.text('failure.inventoryTooLarge'),
    generic: categoriesMessage.text('failure.generic'),
  },
  conflict: {
    /** AUTHORED — the Admin conflict pattern, reused verbatim in structure. */
    title: categoriesMessage.text('conflict.title'),
    body: categoriesMessage.text('conflict.body'),
    reload: categoriesMessage.text('conflict.reload'),
    close: categoriesMessage.text('conflict.close'),
  },
} as const;

/** The validation reason keys resolved to their approved sentences. */
export const CATEGORY_VALIDATION_COPY = {
  'name-required': CATEGORY_COPY.validation.nameRequired,
  'name-too-long': CATEGORY_COPY.validation.nameTooLong,
  'slug-required': CATEGORY_COPY.validation.slugRequired,
  'slug-malformed': CATEGORY_COPY.validation.slugMalformed,
  'slug-too-long': CATEGORY_COPY.validation.slugTooLong,
  'display-order-invalid': CATEGORY_COPY.validation.displayOrderInvalid,
  'display-order-range': CATEGORY_COPY.validation.displayOrderRange,
} as const;

/**
 * The approved sentence for a classified failure, or `null` when the failure
 * has no page-level message.
 *
 * `version-conflict` and `archive-blocked` return `null` deliberately: each has
 * its own approved surface — a dialog and a refusal panel — and also printing a
 * banner would say the same thing twice in two voices.
 */
export function categoryFailureMessage(
  failure:
    | 'not-found'
    | 'slug-conflict'
    | 'slug-immutable'
    | 'invalid-transition'
    | 'archive-blocked'
    | 'version-conflict'
    | 'inventory-too-large'
    | 'generic',
): string | null {
  switch (failure) {
    case 'not-found':
      return CATEGORY_COPY.failure.notFound;
    case 'slug-conflict':
      return CATEGORY_COPY.failure.slugConflict;
    case 'slug-immutable':
      return CATEGORY_COPY.failure.slugImmutable;
    case 'invalid-transition':
      return CATEGORY_COPY.failure.invalidTransition;
    case 'inventory-too-large':
      return CATEGORY_COPY.failure.inventoryTooLarge;
    case 'generic':
      return CATEGORY_COPY.failure.generic;
    default:
      return null;
  }
}

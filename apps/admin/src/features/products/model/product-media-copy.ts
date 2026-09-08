/**
 * Vietnamese copy for Admin Product media management (`APP12-M01.A1`).
 *
 * Split out of `product-form-copy` because the subject is now its own screen
 * region rather than one group of fields: a capacity header, a tile grid with
 * per-position accessible names, two different action treatments (desktop
 * in-tile, mobile selected-image bar), a capacity-aware picker, a PUBLISHED
 * media-only state, and the mapping of five `APP12-M01.B2` refusals. Keeping
 * that beside `fields.priceHelp` would have pushed one catalog past the review
 * threshold and made neither half findable.
 *
 * As everywhere in this repository, the sentences live in
 * `packages/i18n/messages/vi/admin.json` (`APP12-V02` §5A). What is here is the
 * *shape* and the reasoning — why a key exists, and which approved frame it
 * came from — neither of which JSON can hold.
 *
 * Every string is drawn from `FIG-APPROVAL-APP12-M01-D1-PO-001`: the eighteen
 * D1 frames under `933:187` and the seven D1-C1 mobile frames.
 *
 * ## Why so many names carry a position
 *
 * `Di chuyển trước` is identical on twenty tiles. Read out of context by a
 * screen reader it names no image, so every action's accessible name carries
 * `ảnh {position} trên {total}` — the convention `APP2-A03` established for the
 * row list, which the grid inherits rather than reinvents.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

import { MAX_PRODUCT_MEDIA_ITEMS } from './product-media-capacity';
import type { ProductMediaFailure } from './product-media-failure';

const mediaMessage = messageView(VI_MESSAGES.admin, 'productForm.media');
const pickerMessage = messageView(VI_MESSAGES.admin, 'productForm.picker');
const publishedMessage = messageView(VI_MESSAGES.admin, 'productForm.published');
const removePrimaryMessage = messageView(VI_MESSAGES.admin, 'productForm.mediaRemovePrimary');
const failureMessage = messageView(VI_MESSAGES.admin, 'productMediaFailure');

/** One image's place in the set — the only interpolation most names need. */
export interface ProductMediaPosition {
  readonly position: number;
  readonly total: number;
}

export const PRODUCT_MEDIA_COPY = {
  /** Section header (`934:187` — `Ảnh sản phẩm` · `n/20` · `Thêm ảnh`). */
  header: {
    add: mediaMessage.text('pick'),
    help: mediaMessage.text('help'),
    helpNarrow: mediaMessage.text('helpNarrow'),
    /** The visible pill. The cap is the contract's, never a literal in a component. */
    capacity: (count: number): string =>
      mediaMessage.text('capacity', { count, max: MAX_PRODUCT_MEDIA_ITEMS }),
    /** The same fact as a sentence, for the control's accessible description. */
    capacityLabel: (count: number): string =>
      mediaMessage.text('capacityLabel', { count, max: MAX_PRODUCT_MEDIA_ITEMS }),
    /** Shown at `20/20`, beside a disabled add button (`935:398`). */
    capacityFull: mediaMessage.text('capacityFull', { max: MAX_PRODUCT_MEDIA_ITEMS }),
    empty: mediaMessage.text('empty'),
    gridLabel: mediaMessage.text('gridLabel'),
  },

  /** Tile identity and state (`934:231` — the tile-state legend). */
  tile: {
    rolePrimary: mediaMessage.text('roleThumbnail'),
    roleGallery: mediaMessage.text('roleGallery'),
    position: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('positionLabel', { position, total }),
    select: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('selectAction', { position, total }),
    deselect: mediaMessage.text('deselect'),
  },

  /**
   * The four tile actions. Each has a visible label and a distinct accessible
   * name — the mobile bar shows the short label under a glyph, the desktop bar
   * shows the glyph alone, and both read the same long name aloud.
   */
  actions: {
    setPrimary: mediaMessage.text('setPrimary'),
    setPrimaryShort: mediaMessage.text('setPrimaryShort'),
    setPrimaryLabel: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('setPrimaryAction', { position, total }),
    moveEarlier: mediaMessage.text('moveEarlier'),
    moveEarlierShort: mediaMessage.text('moveEarlierShort'),
    moveEarlierLabel: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('moveEarlierAction', { position, total }),
    moveLater: mediaMessage.text('moveLater'),
    moveLaterShort: mediaMessage.text('moveLaterShort'),
    moveLaterLabel: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('moveLaterAction', { position, total }),
    remove: mediaMessage.text('remove'),
    removeShort: mediaMessage.text('removeShort'),
    removeLabel: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('removeAction', { position, total }),
    barLabel: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('actionBarLabel', { position, total }),
    /** Why the primary tile offers neither arrow (`APP12-M01.D1` §H.1). */
    primaryAnchorNote: mediaMessage.text('primaryAnchorNote'),
    /** Why removal is refused on a published product's last image. */
    publishedMinimum: mediaMessage.text('publishedMinimum'),
  },

  /**
   * The polite live region.
   *
   * A reorder changes nothing in the tile's own text — the image and its
   * caption are identical before and after — so without these a keyboard
   * operator presses a button and perceives no result at all.
   */
  announce: {
    reordered: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('reordered', { position, total }),
    removed: (count: number): string => mediaMessage.text('removed', { count }),
    primarySet: (position: number): string => mediaMessage.text('primarySet', { position }),
    selected: ({ position, total }: ProductMediaPosition): string =>
      mediaMessage.text('selected', { position, total }),
  },

  /** Confirmation before the one removal that changes the product elsewhere. */
  removePrimary: {
    title: removePrimaryMessage.text('title'),
    body: removePrimaryMessage.text('body'),
    confirm: removePrimaryMessage.text('confirm'),
    cancel: removePrimaryMessage.text('cancel'),
  },

  /** Picker capacity semantics (`938:187`, `938:255`, `949:187`, `949:238`). */
  picker: {
    title: pickerMessage.text('title'),
    help: pickerMessage.text('help'),
    close: pickerMessage.text('close'),
    cancel: pickerMessage.text('cancel'),
    statusReady: pickerMessage.text('statusReady'),
    loading: pickerMessage.text('loading'),
    emptyTitle: pickerMessage.text('emptyTitle'),
    emptyBody: pickerMessage.text('emptyBody'),
    unavailableTitle: pickerMessage.text('unavailableTitle'),
    unavailableBody: pickerMessage.text('unavailableBody'),
    retry: pickerMessage.text('retry'),
    loadMore: pickerMessage.text('loadMore'),
    loadingMore: pickerMessage.text('loadingMore'),
    loadMoreFailed: pickerMessage.text('loadMoreFailed'),
    /** Remaining capacity, beside the title. */
    remaining: (count: number): string => pickerMessage.text('remaining', { count }),
    /** The footer's running total: what is chosen, and what is still free. */
    footerCount: (selected: number, remaining: number): string =>
      pickerMessage.text('footerCount', { selected, remaining }),
    /** On an option the product already carries — badged, and not selectable. */
    alreadyAdded: pickerMessage.text('alreadyAdded'),
    /** On every unattached option once the product holds twenty. */
    full: pickerMessage.text('full', { max: MAX_PRODUCT_MEDIA_ITEMS }),
    fullNotice: pickerMessage.text('fullNotice', { max: MAX_PRODUCT_MEDIA_ITEMS }),
    confirm: (count: number): string => pickerMessage.text('confirmCount', { count }),
  },

  /** The PUBLISHED media-curation state (`936:187`, `948:355`). */
  published: {
    subtitle: publishedMessage.text('subtitle'),
    subtitleNarrow: publishedMessage.text('subtitleNarrow'),
    bannerTitle: publishedMessage.text('bannerTitle'),
    bannerBody: publishedMessage.text('bannerBody'),
    readOnlyBadge: publishedMessage.text('readOnlyBadge'),
    /** Stated on the media card: curation does not unpublish. */
    mediaNote: publishedMessage.text('mediaNote'),
    statusNote: publishedMessage.text('statusNote'),
    save: publishedMessage.text('save'),
    saving: publishedMessage.text('saving'),
    savingTitle: publishedMessage.text('savingTitle'),
    cancel: publishedMessage.text('cancel'),
  },
} as const;

/**
 * What a refused media save says, per classified outcome.
 *
 * The map is written out rather than composed from the code, because the
 * message-key gate can only verify a key it can read: a `text(code)` call would
 * be a computed key and therefore unverifiable, and the first renamed code
 * would surface as a thrown missing-key error in front of an operator instead
 * of a failing test.
 */
export const PRODUCT_MEDIA_FAILURE_COPY: Readonly<
  Record<ProductMediaFailure, { readonly title: string; readonly body: string }>
> = {
  'not-publishable': {
    title: failureMessage.text('notPublishable.title'),
    body: failureMessage.text('notPublishable.body'),
  },
  'asset-unavailable': {
    title: failureMessage.text('assetUnavailable.title'),
    body: failureMessage.text('assetUnavailable.body'),
  },
  duplicate: {
    title: failureMessage.text('duplicate.title'),
    body: failureMessage.text('duplicate.body'),
  },
  'asset-not-found': {
    title: failureMessage.text('assetNotFound.title'),
    body: failureMessage.text('assetNotFound.body'),
  },
  'version-conflict': {
    title: failureMessage.text('versionConflict.title'),
    body: failureMessage.text('versionConflict.body'),
  },
  'not-editable': {
    title: failureMessage.text('notEditable.title'),
    body: failureMessage.text('notEditable.body'),
  },
  generic: {
    title: failureMessage.text('generic.title'),
    body: failureMessage.text('generic.body'),
  },
} as const;

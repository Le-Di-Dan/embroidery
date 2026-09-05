/**
 * Every operator-facing string in the editor's media section and its two
 * pickers (`870:926`).
 *
 * Kept apart from `gallery-editor-copy.ts` because the media half is a distinct
 * vocabulary with its own failure bands, and because one catalog holding both
 * would be past the review threshold for no reason other than proximity.
 *
 * ### What this catalog deliberately cannot say
 *
 * There is no alt-text label, placeholder or help string anywhere below.
 * `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED` (`APP11-D01-C1`): the contract
 * publishes no `altText` field, so an input for one would collect a value with
 * nowhere to go. The alt an image is rendered with is derived from the entry's
 * own title, and `alt()` below is that derivation, not a stored value.
 *
 * There is no lane, classification, status, storage or rendition vocabulary
 * either. Those are the server's decisions on this operation — a caller cannot
 * choose them — so naming them on screen would offer the operator a choice they
 * do not have.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `galleryMedia`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const galleryMediaMessage = messageView(VI_MESSAGES.admin, 'galleryMedia');

export const GALLERY_MEDIA_COPY = {
  section: {
    title: galleryMediaMessage.text('section.title'),
    /** States the two facts that actually change what the operator sees. */
    help: galleryMediaMessage.text('section.help'),
    empty: galleryMediaMessage.text('section.empty'),
    listLabel: galleryMediaMessage.text('section.listLabel'),
    add: galleryMediaMessage.text('section.add'),
    prepare: galleryMediaMessage.text('section.prepare'),
    save: galleryMediaMessage.text('section.save'),
    saving: galleryMediaMessage.text('section.saving'),
    saved: galleryMediaMessage.text('section.saved'),
    discard: galleryMediaMessage.text('section.discard'),
    /** Announced politely after a reorder or a removal. */
    reordered: galleryMediaMessage.text('section.reordered'),
    removed: galleryMediaMessage.text('section.removed'),
    added: galleryMediaMessage.text('section.added'),
    coverSet: galleryMediaMessage.text('section.coverSet'),
    /** The unsaved-media notice, in the operator's terms. */
    dirty: galleryMediaMessage.text('section.dirty'),
    lockedTitle: galleryMediaMessage.text('section.lockedTitle'),
    lockedBody: galleryMediaMessage.text('section.lockedBody'),
  },

  row: {
    cover: galleryMediaMessage.text('row.cover'),
    position: (index: number) => galleryMediaMessage.text('row.position', { position: index + 1 }),
    moveEarlier: galleryMediaMessage.text('row.moveEarlier'),
    moveLater: galleryMediaMessage.text('row.moveLater'),
    setCover: galleryMediaMessage.text('row.setCover'),
    remove: galleryMediaMessage.text('row.remove'),
    /** The neutral tile while bytes load, and when they cannot be shown. */
    previewLoading: galleryMediaMessage.text('row.previewLoading'),
    previewFailed: galleryMediaMessage.text('row.previewFailed'),
    /** Derived from the entry, never persisted. */
    alt: (title: string, index: number) =>
      galleryMediaMessage.text('row.alt', { position: index + 1, title }),
  },

  picker: {
    title: galleryMediaMessage.text('picker.title'),
    help: galleryMediaMessage.text('picker.help'),
    loading: galleryMediaMessage.text('picker.loading'),
    emptyTitle: galleryMediaMessage.text('picker.emptyTitle'),
    emptyBody: galleryMediaMessage.text('picker.emptyBody'),
    unavailableTitle: galleryMediaMessage.text('picker.unavailableTitle'),
    unavailableBody: galleryMediaMessage.text('picker.unavailableBody'),
    loadMore: galleryMediaMessage.text('picker.loadMore'),
    loadingMore: galleryMediaMessage.text('picker.loadingMore'),
    loadMoreFailed: galleryMediaMessage.text('picker.loadMoreFailed'),
    retry: galleryMediaMessage.text('picker.retry'),
    cancel: galleryMediaMessage.text('picker.cancel'),
    confirm: galleryMediaMessage.text('picker.confirm'),
    selectionCount: (count: number) => galleryMediaMessage.text('picker.selectionCount', { count }),
    /** The tile image's accessible name; never rendered as visible prose. */
    optionAlt: galleryMediaMessage.text('picker.optionAlt'),
  },

  source: {
    title: galleryMediaMessage.text('source.title'),
    help: galleryMediaMessage.text('source.help'),
    loading: galleryMediaMessage.text('source.loading'),
    emptyTitle: galleryMediaMessage.text('source.emptyTitle'),
    emptyBody: galleryMediaMessage.text('source.emptyBody'),
    unavailableTitle: galleryMediaMessage.text('source.unavailableTitle'),
    unavailableBody: galleryMediaMessage.text('source.unavailableBody'),
    loadMore: galleryMediaMessage.text('source.loadMore'),
    loadingMore: galleryMediaMessage.text('source.loadingMore'),
    loadMoreFailed: galleryMediaMessage.text('source.loadMoreFailed'),
    retry: galleryMediaMessage.text('source.retry'),
    cancel: galleryMediaMessage.text('source.cancel'),
    confirm: galleryMediaMessage.text('source.confirm'),
    preparing: galleryMediaMessage.text('source.preparing'),
    prepared: galleryMediaMessage.text('source.prepared'),
    /** The tile's accessible name; the visible tile shows `noPreview`. */
    optionAlt: galleryMediaMessage.text('source.optionAlt'),
    /**
     * The visible tile label. Product media has no authenticated delivery
     * route, so there is nothing to render and the tile says so in two words
     * rather than repeating a sentence on every card.
     */
    noPreview: galleryMediaMessage.text('source.noPreview'),
  },

  failure: {
    /** Media replacement failures. */
    save: {
      notEligible: {
        title: galleryMediaMessage.text('failure.save.notEligible.title'),
        body: galleryMediaMessage.text('failure.save.notEligible.body'),
      },
      duplicate: {
        title: galleryMediaMessage.text('failure.save.duplicate.title'),
        body: galleryMediaMessage.text('failure.save.duplicate.body'),
      },
      notFound: {
        title: galleryMediaMessage.text('failure.save.notFound.title'),
        body: galleryMediaMessage.text('failure.save.notFound.body'),
      },
      unauthenticated: {
        title: galleryMediaMessage.text('failure.save.unauthenticated.title'),
        body: galleryMediaMessage.text('failure.save.unauthenticated.body'),
      },
      generic: {
        title: galleryMediaMessage.text('failure.save.generic.title'),
        body: galleryMediaMessage.text('failure.save.generic.body'),
      },
    },
    /** Preparation failures. */
    prepare: {
      /** The exact approved sentence for a stale source. No automatic retry. */
      staleSource: {
        title: galleryMediaMessage.text('failure.prepare.staleSource.title'),
        body: galleryMediaMessage.text('failure.prepare.staleSource.body'),
      },
      notEligible: {
        title: galleryMediaMessage.text('failure.prepare.notEligible.title'),
        body: galleryMediaMessage.text('failure.prepare.notEligible.body'),
      },
      unavailable: {
        title: galleryMediaMessage.text('failure.prepare.unavailable.title'),
        body: galleryMediaMessage.text('failure.prepare.unavailable.body'),
      },
      unauthenticated: {
        title: galleryMediaMessage.text('failure.prepare.unauthenticated.title'),
        body: galleryMediaMessage.text('failure.prepare.unauthenticated.body'),
      },
      generic: {
        title: galleryMediaMessage.text('failure.prepare.generic.title'),
        body: galleryMediaMessage.text('failure.prepare.generic.body'),
      },
    },
  },
} as const;

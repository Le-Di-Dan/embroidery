/**
 * Every operator-facing string on the create bootstrap and the gallery editor
 * (`868:909`, `870:1104`, `870:1187`, `870:1274`, `870:1368`).
 *
 * One catalog per concern, so no component hard-codes copy (CLAUDE.md §5) and
 * the screen's vocabulary can be reviewed as a whole. Media and picker strings
 * live beside them in `gallery-media-copy.ts`; the three **status** labels are
 * in neither, because `APP11-A01` already owns them and an entry must not be
 * named one thing in the list and another in the editor.
 *
 * ### Only what an operator can act on
 *
 * This catalog carries no endpoint name, no contract field (`expectedUpdatedAt`,
 * `assetIds`, `display_order`), no DTO name, no checkpoint identifier and no
 * note explaining why the screen is built the way it is. Those are engineering
 * facts: they belong in these comments and in the completion report, and they
 * are noise to an operator authoring a gallery entry. Every string below is a
 * thing the operator is being told, asked, or offered.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message`, `code`, HTTP status or `requestId` is never rendered.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `galleryEditor`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const galleryEditorMessage = messageView(VI_MESSAGES.admin, 'galleryEditor');

export const GALLERY_EDITOR_COPY = {
  create: {
    /** The action `866:905` and `867:907` draw on the list. */
    open: galleryEditorMessage.text('create.open'),
    title: galleryEditorMessage.text('create.title'),
    help: galleryEditorMessage.text('create.help'),
    submit: galleryEditorMessage.text('create.submit'),
    submitting: galleryEditorMessage.text('create.submitting'),
    cancel: galleryEditorMessage.text('create.cancel'),
    fields: {
      title: galleryEditorMessage.text('create.fields.title'),
      slug: galleryEditorMessage.text('create.fields.slug'),
      slugHelp: galleryEditorMessage.text('create.fields.slugHelp'),
      description: galleryEditorMessage.text('create.fields.description'),
      displayOrder: galleryEditorMessage.text('create.fields.displayOrder'),
      displayOrderHelp: galleryEditorMessage.text('create.fields.displayOrderHelp'),
      isIndexable: galleryEditorMessage.text('create.fields.isIndexable'),
    },
    /** Offered, never applied silently — the operator edits it before submit. */
    suggestSlug: galleryEditorMessage.text('create.suggestSlug'),
    validation: {
      summaryTitle: galleryEditorMessage.text('create.validation.summaryTitle'),
      titleRequired: galleryEditorMessage.text('create.validation.titleRequired'),
      slugRequired: galleryEditorMessage.text('create.validation.slugRequired'),
      slugInvalid: galleryEditorMessage.text('create.validation.slugInvalid'),
      descriptionRequired: galleryEditorMessage.text('create.validation.descriptionRequired'),
      displayOrderInvalid: galleryEditorMessage.text('create.validation.displayOrderInvalid'),
    },
    failure: {
      slugConflict: {
        title: galleryEditorMessage.text('create.failure.slugConflict.title'),
        body: galleryEditorMessage.text('create.failure.slugConflict.body'),
      },
      invalid: {
        title: galleryEditorMessage.text('create.failure.invalid.title'),
        body: galleryEditorMessage.text('create.failure.invalid.body'),
      },
      unauthenticated: {
        title: galleryEditorMessage.text('create.failure.unauthenticated.title'),
        body: galleryEditorMessage.text('create.failure.unauthenticated.body'),
      },
      generic: {
        title: galleryEditorMessage.text('create.failure.generic.title'),
        body: galleryEditorMessage.text('create.failure.generic.body'),
      },
    },
  },

  detail: {
    breadcrumb: galleryEditorMessage.text('detail.breadcrumb'),
    backToList: galleryEditorMessage.text('detail.backToList'),
    loading: galleryEditorMessage.text('detail.loading'),
    notFoundTitle: galleryEditorMessage.text('detail.notFoundTitle'),
    notFoundBody: galleryEditorMessage.text('detail.notFoundBody'),
    unavailableTitle: galleryEditorMessage.text('detail.unavailableTitle'),
    unavailableBody: galleryEditorMessage.text('detail.unavailableBody'),
    unauthenticatedTitle: galleryEditorMessage.text('detail.unauthenticatedTitle'),
    unauthenticatedBody: galleryEditorMessage.text('detail.unauthenticatedBody'),
    retry: galleryEditorMessage.text('detail.retry'),
    signIn: galleryEditorMessage.text('detail.signIn'),
  },

  authoring: {
    groupTitle: galleryEditorMessage.text('authoring.groupTitle'),
    seoGroupTitle: galleryEditorMessage.text('authoring.seoGroupTitle'),
    save: galleryEditorMessage.text('authoring.save'),
    saving: galleryEditorMessage.text('authoring.saving'),
    saved: galleryEditorMessage.text('authoring.saved'),
    discard: galleryEditorMessage.text('authoring.discard'),
    fields: {
      title: galleryEditorMessage.text('authoring.fields.title'),
      slug: galleryEditorMessage.text('authoring.fields.slug'),
      /** The approved read-only explanation. No DTO or endpoint is named. */
      slugLocked: galleryEditorMessage.text('authoring.fields.slugLocked'),
      description: galleryEditorMessage.text('authoring.fields.description'),
      displayOrder: galleryEditorMessage.text('authoring.fields.displayOrder'),
      displayOrderHelp: galleryEditorMessage.text('authoring.fields.displayOrderHelp'),
      seoTitle: galleryEditorMessage.text('authoring.fields.seoTitle'),
      seoTitleHelp: galleryEditorMessage.text('authoring.fields.seoTitleHelp'),
      seoDescription: galleryEditorMessage.text('authoring.fields.seoDescription'),
      seoDescriptionHelp: galleryEditorMessage.text('authoring.fields.seoDescriptionHelp'),
      isIndexable: galleryEditorMessage.text('authoring.fields.isIndexable'),
      /**
       * States the real consequence, and states that it is not a publication
       * gate — because the server does not treat it as one.
       */
      isIndexableHelp: galleryEditorMessage.text('authoring.fields.isIndexableHelp'),
    },
    validation: {
      summaryTitle: galleryEditorMessage.text('authoring.validation.summaryTitle'),
      titleRequired: galleryEditorMessage.text('authoring.validation.titleRequired'),
      displayOrderInvalid: galleryEditorMessage.text('authoring.validation.displayOrderInvalid'),
      seoTitleTooLong: galleryEditorMessage.text('authoring.validation.seoTitleTooLong'),
      seoDescriptionTooLong: galleryEditorMessage.text(
        'authoring.validation.seoDescriptionTooLong',
      ),
    },
    failure: {
      invalid: {
        title: galleryEditorMessage.text('authoring.failure.invalid.title'),
        body: galleryEditorMessage.text('authoring.failure.invalid.body'),
      },
      notFound: {
        title: galleryEditorMessage.text('authoring.failure.notFound.title'),
        body: galleryEditorMessage.text('authoring.failure.notFound.body'),
      },
      unauthenticated: {
        title: galleryEditorMessage.text('authoring.failure.unauthenticated.title'),
        body: galleryEditorMessage.text('authoring.failure.unauthenticated.body'),
      },
      generic: {
        title: galleryEditorMessage.text('authoring.failure.generic.title'),
        body: galleryEditorMessage.text('authoring.failure.generic.body'),
      },
    },
  },

  linkedProduct: {
    groupTitle: galleryEditorMessage.text('linkedProduct.groupTitle'),
    help: galleryEditorMessage.text('linkedProduct.help'),
    none: galleryEditorMessage.text('linkedProduct.none'),
    choose: galleryEditorMessage.text('linkedProduct.choose'),
    change: galleryEditorMessage.text('linkedProduct.change'),
    clear: galleryEditorMessage.text('linkedProduct.clear'),
    /** Shown while the linked product's own name is still being read. */
    resolving: galleryEditorMessage.text('linkedProduct.resolving'),
    /** Never the raw identifier: a truthful placeholder instead. */
    unresolved: galleryEditorMessage.text('linkedProduct.unresolved'),
    picker: {
      title: galleryEditorMessage.text('linkedProduct.picker.title'),
      help: galleryEditorMessage.text('linkedProduct.picker.help'),
      loading: galleryEditorMessage.text('linkedProduct.picker.loading'),
      emptyTitle: galleryEditorMessage.text('linkedProduct.picker.emptyTitle'),
      emptyBody: galleryEditorMessage.text('linkedProduct.picker.emptyBody'),
      unavailableTitle: galleryEditorMessage.text('linkedProduct.picker.unavailableTitle'),
      unavailableBody: galleryEditorMessage.text('linkedProduct.picker.unavailableBody'),
      loadMore: galleryEditorMessage.text('linkedProduct.picker.loadMore'),
      loadingMore: galleryEditorMessage.text('linkedProduct.picker.loadingMore'),
      loadMoreFailed: galleryEditorMessage.text('linkedProduct.picker.loadMoreFailed'),
      retry: galleryEditorMessage.text('linkedProduct.picker.retry'),
      cancel: galleryEditorMessage.text('linkedProduct.picker.cancel'),
      select: galleryEditorMessage.text('linkedProduct.picker.select'),
    },
  },

  publication: {
    groupTitle: galleryEditorMessage.text('publication.groupTitle'),
    statusLabel: galleryEditorMessage.text('publication.statusLabel'),
    readyTitle: galleryEditorMessage.text('publication.readyTitle'),
    readyBody: galleryEditorMessage.text('publication.readyBody'),
    blockedTitle: galleryEditorMessage.text('publication.blockedTitle'),
    blockedBody: galleryEditorMessage.text('publication.blockedBody'),
    publishedTitle: galleryEditorMessage.text('publication.publishedTitle'),
    publishedBody: galleryEditorMessage.text('publication.publishedBody'),
    archivedTitle: galleryEditorMessage.text('publication.archivedTitle'),
    /** Truthful about what this build can do, without naming a missing API. */
    archivedBody: galleryEditorMessage.text('publication.archivedBody'),
    requirements: {
      title: galleryEditorMessage.text('publication.requirements.title'),
      slug: galleryEditorMessage.text('publication.requirements.slug'),
      description: galleryEditorMessage.text('publication.requirements.description'),
      asset: galleryEditorMessage.text('publication.requirements.asset'),
    },
    /** Shown while local edits mean the persisted state is not what is on screen. */
    unsavedTitle: galleryEditorMessage.text('publication.unsavedTitle'),
    unsavedBody: galleryEditorMessage.text('publication.unsavedBody'),
    publish: galleryEditorMessage.text('publication.publish'),
    publishing: galleryEditorMessage.text('publication.publishing'),
    published: galleryEditorMessage.text('publication.published'),
    unpublish: galleryEditorMessage.text('publication.unpublish'),
    unpublishing: galleryEditorMessage.text('publication.unpublishing'),
    unpublished: galleryEditorMessage.text('publication.unpublished'),
    confirmUnpublish: {
      title: galleryEditorMessage.text('publication.confirmUnpublish.title'),
      body: galleryEditorMessage.text('publication.confirmUnpublish.body'),
      confirm: galleryEditorMessage.text('publication.confirmUnpublish.confirm'),
      cancel: galleryEditorMessage.text('publication.confirmUnpublish.cancel'),
    },
    failure: {
      notReady: {
        title: galleryEditorMessage.text('publication.failure.notReady.title'),
        body: galleryEditorMessage.text('publication.failure.notReady.body'),
      },
      notAllowed: {
        title: galleryEditorMessage.text('publication.failure.notAllowed.title'),
        body: galleryEditorMessage.text('publication.failure.notAllowed.body'),
      },
      notFound: {
        title: galleryEditorMessage.text('publication.failure.notFound.title'),
        body: galleryEditorMessage.text('publication.failure.notFound.body'),
      },
      unauthenticated: {
        title: galleryEditorMessage.text('publication.failure.unauthenticated.title'),
        body: galleryEditorMessage.text('publication.failure.unauthenticated.body'),
      },
      generic: {
        title: galleryEditorMessage.text('publication.failure.generic.title'),
        body: galleryEditorMessage.text('publication.failure.generic.body'),
      },
    },
  },

  conflict: {
    title: galleryEditorMessage.text('conflict.title'),
    body: galleryEditorMessage.text('conflict.body'),
    /** Named separately so the operator knows reloading is not free. */
    bodyWithChanges: galleryEditorMessage.text('conflict.bodyWithChanges'),
    reload: galleryEditorMessage.text('conflict.reload'),
    close: galleryEditorMessage.text('conflict.close'),
  },

  unsaved: {
    title: galleryEditorMessage.text('unsaved.title'),
    body: galleryEditorMessage.text('unsaved.body'),
    stay: galleryEditorMessage.text('unsaved.stay'),
    leave: galleryEditorMessage.text('unsaved.leave'),
  },
} as const;

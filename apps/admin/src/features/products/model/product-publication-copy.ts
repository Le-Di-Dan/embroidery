/**
 * Vietnamese copy catalog for the Admin product publication interaction
 * (`APP2-A04`).
 *
 * Reproduced from the approved Publication nodes
 * `FIG-ADMIN-PUBLICATION-DESKTOP-{READY,BLOCKED,CONFIRM-UNPUBLISH}` (`441:106`,
 * `442:110`, `442:205`) and `FIG-ADMIN-PUBLICATION-MOBILE` (`443:121`), read
 * together with the binding A04 reconciliations.
 *
 * Three rules shape what may appear here.
 *
 * *Nothing claims a public address.* The public Product route is not delivered
 * until `APP2-B04`/`APP2-S02`, so no string here says a page is live, links to
 * `/san-pham/<slug>` or invites the operator to view the storefront. Publishing
 * makes a product *eligible* for public display; that is the strongest true
 * statement this build can make.
 *
 * *Unpublish is never described as archive or delete.* They are different
 * lifecycle transitions with different consequences, and the confirmation says
 * so explicitly rather than leaving the operator to infer it.
 *
 * *No requirement string names a storage internal.* The seven requirement codes
 * are about the product as the operator understands it — name, description,
 * category, price, images — never about assets, derivatives, checksums or
 * buckets, which the operator neither controls nor should see.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { AdminProductRequirementResponseCode } from '@embroidery/api-client';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `productRequirementLabel`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productRequirementLabelMessage = messageView(VI_MESSAGES.admin, 'productRequirementLabel');

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `productPublication`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const productPublicationMessage = messageView(VI_MESSAGES.admin, 'productPublication');

/**
 * Operator-facing text for every requirement code in the contract.
 *
 * Keyed by the generated enum, so a code added to the contract fails the build
 * here instead of silently rendering as the unknown fallback. That is the whole
 * point of the exhaustive mapping: a new requirement must be a deliberate copy
 * decision, not a blank row.
 */
export const PRODUCT_REQUIREMENT_LABEL: Readonly<
  Record<
    (typeof AdminProductRequirementResponseCode)[keyof typeof AdminProductRequirementResponseCode],
    string
  >
> = {
  [AdminProductRequirementResponseCode.PRODUCT_NAME_READY]:
    productRequirementLabelMessage.text('PRODUCT_NAME_READY'),
  [AdminProductRequirementResponseCode.PRODUCT_DESCRIPTION_READY]:
    productRequirementLabelMessage.text('PRODUCT_DESCRIPTION_READY'),
  [AdminProductRequirementResponseCode.PRODUCT_CATEGORY_READY]:
    productRequirementLabelMessage.text('PRODUCT_CATEGORY_READY'),
  [AdminProductRequirementResponseCode.PRODUCT_PRICE_READY]:
    productRequirementLabelMessage.text('PRODUCT_PRICE_READY'),
  [AdminProductRequirementResponseCode.PRODUCT_MEDIA_READY]:
    productRequirementLabelMessage.text('PRODUCT_MEDIA_READY'),
  [AdminProductRequirementResponseCode.PRODUCT_MEDIA_ASSETS_READY]:
    productRequirementLabelMessage.text('PRODUCT_MEDIA_ASSETS_READY'),
  [AdminProductRequirementResponseCode.PRODUCT_MEDIA_DERIVATIVES_READY]:
    productRequirementLabelMessage.text('PRODUCT_MEDIA_DERIVATIVES_READY'),
};

export const PRODUCT_PUBLICATION_COPY = {
  /** The entry point rendered on the A03 detail screen. */
  entry: {
    /** DRAFT: the operator is going somewhere to publish. */
    fromDraft: productPublicationMessage.text('entry.fromDraft'),
    /** PUBLISHED: the product is already public; this manages that. */
    fromPublished: productPublicationMessage.text('entry.fromPublished'),
  },

  screen: {
    title: productPublicationMessage.text('screen.title'),
    backToProduct: productPublicationMessage.text('screen.backToProduct'),
    backToList: productPublicationMessage.text('screen.backToList'),
    loading: productPublicationMessage.text('screen.loading'),
    requirementsHeading: productPublicationMessage.text('screen.requirementsHeading'),
    summaryHeading: productPublicationMessage.text('screen.summaryHeading'),
    mediaHeading: productPublicationMessage.text('screen.mediaHeading'),
    /** The read-only slug. Metadata only — never presented as a link. */
    slugLabel: productPublicationMessage.text('screen.slugLabel'),
    slugNote: productPublicationMessage.text('screen.slugNote'),
    categoryLabel: productPublicationMessage.text('screen.categoryLabel'),
    descriptionLabel: productPublicationMessage.text('screen.descriptionLabel'),
    priceLabel: productPublicationMessage.text('screen.priceLabel'),
    statusLabel: productPublicationMessage.text('screen.statusLabel'),
    /** Marks the first ordered image, matching the A03 media identity. */
    primaryMedia: productPublicationMessage.text('screen.primaryMedia'),
    noMedia: productPublicationMessage.text('screen.noMedia'),
    noDescription: productPublicationMessage.text('screen.noDescription'),
    noPrice: productPublicationMessage.text('screen.noPrice'),
  },

  requirements: {
    satisfied: productPublicationMessage.text('requirements.satisfied'),
    unsatisfied: productPublicationMessage.text('requirements.unsatisfied'),
    /**
     * A requirement code this build does not recognise. It renders visibly and
     * is treated as unmet — a newer server that adds a requirement must never
     * have it silently counted as satisfied by an older screen.
     */
    unknown: productPublicationMessage.text('requirements.unknown'),
  },

  ready: {
    title: productPublicationMessage.text('ready.title'),
    body: productPublicationMessage.text('ready.body'),
    /**
     * Deliberately does not promise a live URL: `APP2-B04`/`APP2-S02` own the
     * public route, and this build cannot truthfully say a page exists.
     */
    consequence: productPublicationMessage.text('ready.consequence'),
    publish: productPublicationMessage.text('ready.publish'),
    publishing: productPublicationMessage.text('ready.publishing'),
    edit: productPublicationMessage.text('ready.edit'),
  },

  blocked: {
    title: productPublicationMessage.text('blocked.title'),
    body: productPublicationMessage.text('blocked.body'),
    edit: productPublicationMessage.text('blocked.edit'),
  },

  published: {
    title: productPublicationMessage.text('published.title'),
    body: productPublicationMessage.text('published.body'),
    unpublish: productPublicationMessage.text('published.unpublish'),
    unpublishing: productPublicationMessage.text('published.unpublishing'),
    /** A published product is not editable in `APP2-A03`; the label says so. */
    view: productPublicationMessage.text('published.view'),
  },

  archived: {
    title: productPublicationMessage.text('archived.title'),
    body: productPublicationMessage.text('archived.body'),
  },

  unpublishDialog: {
    title: productPublicationMessage.text('unpublishDialog.title'),
    body: productPublicationMessage.text('unpublishDialog.body'),
    /**
     * Present because the two are genuinely different transitions and the
     * operator cannot be expected to know that from the verb alone.
     */
    reassurance: productPublicationMessage.text('unpublishDialog.reassurance'),
    confirm: productPublicationMessage.text('unpublishDialog.confirm'),
    cancel: productPublicationMessage.text('unpublishDialog.cancel'),
  },

  success: {
    publishedTitle: productPublicationMessage.text('success.publishedTitle'),
    publishedBody: productPublicationMessage.text('success.publishedBody'),
    unpublishedTitle: productPublicationMessage.text('success.unpublishedTitle'),
    unpublishedBody: productPublicationMessage.text('success.unpublishedBody'),
  },

  failure: {
    /** Readiness failed but the product loaded; the summary stays visible. */
    readinessTitle: productPublicationMessage.text('failure.readinessTitle'),
    readinessBody: productPublicationMessage.text('failure.readinessBody'),
    retry: productPublicationMessage.text('failure.retry'),
    notFoundTitle: productPublicationMessage.text('failure.notFoundTitle'),
    notFoundBody: productPublicationMessage.text('failure.notFoundBody'),
    unavailableTitle: productPublicationMessage.text('failure.unavailableTitle'),
    unavailableBody: productPublicationMessage.text('failure.unavailableBody'),
    /**
     * The two snapshots disagree about status or token. Mutations are disabled
     * until they agree again — acting on a mixed snapshot is how a command gets
     * sent with a token that belongs to a state the operator never saw.
     */
    mismatchTitle: productPublicationMessage.text('failure.mismatchTitle'),
    mismatchBody: productPublicationMessage.text('failure.mismatchBody'),
    mismatchRetry: productPublicationMessage.text('failure.mismatchRetry'),
  },

  /**
   * Command outcomes, keyed by the classification in
   * `product-publication-failure`. Every one of these is safe to render: none
   * echoes a server message, a domain code, a request id or a token.
   */
  commandFailure: {
    'not-ready': {
      title: productPublicationMessage.text('commandFailure.not-ready.title'),
      body: productPublicationMessage.text('commandFailure.not-ready.body'),
    },
    'publish-not-allowed': {
      title: productPublicationMessage.text('commandFailure.publish-not-allowed.title'),
      body: productPublicationMessage.text('commandFailure.publish-not-allowed.body'),
    },
    'unpublish-not-allowed': {
      title: productPublicationMessage.text('commandFailure.unpublish-not-allowed.title'),
      body: productPublicationMessage.text('commandFailure.unpublish-not-allowed.body'),
    },
    generic: {
      title: productPublicationMessage.text('commandFailure.generic.title'),
      body: productPublicationMessage.text('commandFailure.generic.body'),
    },
  },
} as const;

/**
 * Every user-facing string on the customer-access support screen, in one place
 * (CLAUDE.md §5 — no hard-coded copy in components).
 *
 * The wording follows the approved `APP4-D01` A01 frames as amended under
 * `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`. Two rules govern what may be said
 * here, and both are security rules rather than tone:
 *
 * 1. **No refusal explains itself past what the server published.** The lookup
 *    miss says "no customer matches" and never "that address is not verified" —
 *    the server refuses to distinguish those, and copy that did would put the
 *    distinction back.
 * 2. **No string interpolates a contact, a code, a token or a digest.** The only
 *    contact representation on this screen is the server's mask, rendered as it
 *    arrives.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-support.json`, under `customerAccess`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const customerAccessMessage = messageView(VI_MESSAGES.adminSupport, 'customerAccess');

export const CUSTOMER_ACCESS_COPY = {
  page: {
    title: customerAccessMessage.text('page.title'),
    subtitle: customerAccessMessage.text('page.subtitle'),
  },

  lookup: {
    heading: customerAccessMessage.text('lookup.heading'),
    kindLabel: customerAccessMessage.text('lookup.kindLabel'),
    kindEmail: customerAccessMessage.text('lookup.kindEmail'),
    kindPhone: customerAccessMessage.text('lookup.kindPhone'),
    contactLabel: customerAccessMessage.text('lookup.contactLabel'),
    placeholder: customerAccessMessage.text('lookup.placeholder'),
    submit: customerAccessMessage.text('lookup.submit'),
    submitting: customerAccessMessage.text('lookup.submitting'),
    hint: customerAccessMessage.text('lookup.hint'),
    blank: customerAccessMessage.text('lookup.blank'),
    idle: customerAccessMessage.text('lookup.idle'),
  },

  customer: {
    heading: customerAccessMessage.text('customer.heading'),
    loading: customerAccessMessage.text('customer.loading'),
    customerId: customerAccessMessage.text('customer.customerId'),
    displayName: customerAccessMessage.text('customer.displayName'),
    displayNameEmpty: customerAccessMessage.text('customer.displayNameEmpty'),
    verifiedAt: customerAccessMessage.text('customer.verifiedAt'),
    contactsHeading: customerAccessMessage.text('customer.contactsHeading'),
    kindEmail: customerAccessMessage.text('customer.kindEmail'),
    kindPhone: customerAccessMessage.text('customer.kindPhone'),
    primary: customerAccessMessage.text('customer.primary'),
    verified: customerAccessMessage.text('customer.verified'),
    unverified: customerAccessMessage.text('customer.unverified'),
    maskNote: customerAccessMessage.text('customer.maskNote'),
  },

  grant: {
    heading: customerAccessMessage.text('grant.heading'),
    loading: customerAccessMessage.text('grant.loading'),
    none: customerAccessMessage.text('grant.none'),
    noneActive: customerAccessMessage.text('grant.noneActive'),
    scope: customerAccessMessage.text('grant.scope'),
    request: customerAccessMessage.text('grant.request'),
    expiresAt: customerAccessMessage.text('grant.expiresAt'),
    status: customerAccessMessage.text('grant.status'),
    statusActive: customerAccessMessage.text('grant.statusActive'),
    statusExpiredByTime: customerAccessMessage.text('grant.statusExpiredByTime'),
    statusExpired: customerAccessMessage.text('grant.statusExpired'),
    statusRevoked: customerAccessMessage.text('grant.statusRevoked'),
    revoke: customerAccessMessage.text('grant.revoke'),
    secretNote: customerAccessMessage.text('grant.secretNote'),
  },

  revoke: {
    title: customerAccessMessage.text('revoke.title'),
    body: customerAccessMessage.text('revoke.body'),
    reasonLabel: customerAccessMessage.text('revoke.reasonLabel'),
    reasonHint: customerAccessMessage.text('revoke.reasonHint'),
    reasonBlank: customerAccessMessage.text('revoke.reasonBlank'),
    reasonTooLong: customerAccessMessage.text('revoke.reasonTooLong'),
    confirm: customerAccessMessage.text('revoke.confirm'),
    working: customerAccessMessage.text('revoke.working'),
    cancel: customerAccessMessage.text('revoke.cancel'),
    success: customerAccessMessage.text('revoke.success'),
    conflict: customerAccessMessage.text('revoke.conflict'),
    missing: customerAccessMessage.text('revoke.missing'),
  },

  notification: {
    heading: customerAccessMessage.text('notification.heading'),
    loading: customerAccessMessage.text('notification.loading'),
    none: customerAccessMessage.text('notification.none'),
    boundNote: customerAccessMessage.text('notification.boundNote'),
    channel: customerAccessMessage.text('notification.channel'),
    recipient: customerAccessMessage.text('notification.recipient'),
    template: customerAccessMessage.text('notification.template'),
    /**
     * The template's identity as one value: its key and the version that was
     * delivered. Composed here rather than in the panel's JSX, where the `· v`
     * between them was two text nodes no message repository could reach.
     */
    templateValue: (templateKey: string, version: number | string): string =>
      customerAccessMessage.text('notification.templateValue', { templateKey, version }),
    createdAt: customerAccessMessage.text('notification.createdAt'),
    status: customerAccessMessage.text('notification.status'),
    statusFailed: customerAccessMessage.text('notification.statusFailed'),
    timelineHeading: customerAccessMessage.text('notification.timelineHeading'),
    columnIndex: customerAccessMessage.text('notification.columnIndex'),
    columnAt: customerAccessMessage.text('notification.columnAt'),
    columnOutcome: customerAccessMessage.text('notification.columnOutcome'),
    columnErrorClass: customerAccessMessage.text('notification.columnErrorClass'),
    noErrorClass: customerAccessMessage.text('notification.noErrorClass'),
    replay: customerAccessMessage.text('notification.replay'),
    redactionNote: customerAccessMessage.text('notification.redactionNote'),
  },

  replay: {
    title: customerAccessMessage.text('replay.title'),
    body: customerAccessMessage.text('replay.body'),
    confirm: customerAccessMessage.text('replay.confirm'),
    working: customerAccessMessage.text('replay.working'),
    cancel: customerAccessMessage.text('replay.cancel'),
    created: customerAccessMessage.text('replay.created'),
    existing: customerAccessMessage.text('replay.existing'),
    existingBody: customerAccessMessage.text('replay.existingBody'),
    queuedNote: customerAccessMessage.text('replay.queuedNote'),
    reissueTitle: customerAccessMessage.text('replay.reissueTitle'),
    reissueBody: customerAccessMessage.text('replay.reissueBody'),
    notApplicable: customerAccessMessage.text('replay.notApplicable'),
    sourceUnavailable: customerAccessMessage.text('replay.sourceUnavailable'),
    missing: customerAccessMessage.text('replay.missing'),
  },

  failure: {
    loadError: customerAccessMessage.text('failure.loadError'),
    loadErrorBody: customerAccessMessage.text('failure.loadErrorBody'),
    retry: customerAccessMessage.text('failure.retry'),
    notFoundTitle: customerAccessMessage.text('failure.notFoundTitle'),
    notFoundBody: customerAccessMessage.text('failure.notFoundBody'),
    notFoundNote: customerAccessMessage.text('failure.notFoundNote'),
    unauthenticated: customerAccessMessage.text('failure.unauthenticated'),
    forbidden: customerAccessMessage.text('failure.forbidden'),
    generic: customerAccessMessage.text('failure.generic'),
  },
} as const;

/** `secure_access_grants.revoke_reason` is bounded server-side at 500. */
export const REVOKE_REASON_MAX_LENGTH = 500;

/**
 * Every user-facing string the `APP10-A01` maintenance affordances add
 * (CLAUDE.md §5 — no hard-coded copy in components).
 *
 * The wording follows the approved `APP10-D01` A01 frames, promoted under
 * `FIG-APPROVAL-APP10-D01-PO-001`. It is kept beside `CUSTOMER_ACCESS_COPY`
 * rather than inside it because the two are owned by different checkpoints and
 * different Figma packages: `APP4-D01` still governs the lookup, grant and
 * notification wording, and merging the tables would make one review boundary
 * out of two.
 *
 * The same two rules govern what may be said here, and both are security rules:
 *
 * 1. **No refusal explains itself past what the server published.** The generic
 *    contact conflict names both possibilities it cannot separate rather than
 *    picking the more likely one — `APP10-B01` publishes no code that would let
 *    the screen know, and inventing certainty is worse than stating the doubt.
 * 2. **No string interpolates a contact, an id or an operator note.** The only
 *    contact representation on this screen is the server's mask, and
 *    `contactId` addresses operations — it is never rendered as copy.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-support.json`, under `customerMaintenance`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const customerMaintenanceMessage = messageView(VI_MESSAGES.adminSupport, 'customerMaintenance');

export const CUSTOMER_MAINTENANCE_COPY = {
  profile: {
    heading: customerMaintenanceMessage.text('profile.heading'),
    edit: customerMaintenanceMessage.text('profile.edit'),
    displayNameLabel: customerMaintenanceMessage.text('profile.displayNameLabel'),
    displayNameHint: customerMaintenanceMessage.text('profile.displayNameHint'),
    notesLabel: customerMaintenanceMessage.text('profile.notesLabel'),
    notesHint: customerMaintenanceMessage.text('profile.notesHint'),
    notesEmpty: customerMaintenanceMessage.text('profile.notesEmpty'),
    save: customerMaintenanceMessage.text('profile.save'),
    saving: customerMaintenanceMessage.text('profile.saving'),
    cancel: customerMaintenanceMessage.text('profile.cancel'),
    saved: customerMaintenanceMessage.text('profile.saved'),
    scopeNote: customerMaintenanceMessage.text('profile.scopeNote'),
    unchanged: customerMaintenanceMessage.text('profile.unchanged'),
    displayNameTooLong: customerMaintenanceMessage.text('profile.displayNameTooLong'),
    notesTooLong: customerMaintenanceMessage.text('profile.notesTooLong'),
    validation: customerMaintenanceMessage.text('profile.validation'),
    merged: customerMaintenanceMessage.text('profile.merged'),
    stale: customerMaintenanceMessage.text('profile.stale'),
    unauthenticated: customerMaintenanceMessage.text('profile.unauthenticated'),
    forbidden: customerMaintenanceMessage.text('profile.forbidden'),
    generic: customerMaintenanceMessage.text('profile.generic'),
  },

  contacts: {
    promote: customerMaintenanceMessage.text('contacts.promote'),
    deactivate: customerMaintenanceMessage.text('contacts.deactivate'),
    // The matrix in `FIG-APP10-A01-CONTACT-ELIGIBILITY` stated as one sentence:
    // why the primary row carries neither action, and why an unverified one
    // cannot be promoted from here.
    eligibilityNote: customerMaintenanceMessage.text('contacts.eligibilityNote'),
    deactivatedNote: customerMaintenanceMessage.text('contacts.deactivatedNote'),
  },

  promote: {
    title: customerMaintenanceMessage.text('promote.title'),
    body: customerMaintenanceMessage.text('promote.body'),
    confirm: customerMaintenanceMessage.text('promote.confirm'),
    working: customerMaintenanceMessage.text('promote.working'),
    cancel: customerMaintenanceMessage.text('promote.cancel'),
    close: customerMaintenanceMessage.text('promote.close'),
    successTitle: customerMaintenanceMessage.text('promote.successTitle'),
    successBody: customerMaintenanceMessage.text('promote.successBody'),
  },

  deactivate: {
    title: customerMaintenanceMessage.text('deactivate.title'),
    // States in the dialog itself that this is not a delete, and that there is
    // no way back through this screen — `APP10-B01` publishes no reactivate
    // operation, so an undo affordance would be a button with nothing behind it.
    body: customerMaintenanceMessage.text('deactivate.body'),
    confirm: customerMaintenanceMessage.text('deactivate.confirm'),
    working: customerMaintenanceMessage.text('deactivate.working'),
    cancel: customerMaintenanceMessage.text('deactivate.cancel'),
    close: customerMaintenanceMessage.text('deactivate.close'),
    successTitle: customerMaintenanceMessage.text('deactivate.successTitle'),
    successBody: customerMaintenanceMessage.text('deactivate.successBody'),
  },

  contactFailure: {
    primary: customerMaintenanceMessage.text('contactFailure.primary'),
    lastVerified: customerMaintenanceMessage.text('contactFailure.lastVerified'),
    unverified: customerMaintenanceMessage.text('contactFailure.unverified'),
    stale: customerMaintenanceMessage.text('contactFailure.stale'),
    conflict: customerMaintenanceMessage.text('contactFailure.conflict'),
    unauthenticated: customerMaintenanceMessage.text('contactFailure.unauthenticated'),
    forbidden: customerMaintenanceMessage.text('contactFailure.forbidden'),
    generic: customerMaintenanceMessage.text('contactFailure.generic'),
  },
} as const;

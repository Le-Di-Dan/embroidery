/**
 * Every operator-facing string on the lifecycle screen (`APP3-A04`).
 *
 * Transcribed from the five approved frames in Figma section `596:10`
 * (`FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-*`). One catalogue, so no server message
 * can reach the screen: a lifecycle failure selects a key here, and the
 * normalized envelope's `message` is never rendered.
 *
 * The wording carries the rulings, not just labels. Archive says *retained, not
 * deleted*; restore says *returns to DRAFT, not republished*; the readiness
 * footer says the server changes nothing when it refuses. Those sentences are
 * the contract the operator is owed.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `designTemplateLifecycle`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const designTemplateLifecycleMessage = messageView(
  VI_MESSAGES.adminWave2,
  'designTemplateLifecycle',
);

export const LIFECYCLE_COPY = {
  page: {
    back: designTemplateLifecycleMessage.text('page.back'),
    versionSuffix: designTemplateLifecycleMessage.text('page.versionSuffix'),
    noVersion: designTemplateLifecycleMessage.text('page.noVersion'),
    loading: designTemplateLifecycleMessage.text('page.loading'),
    loadFailed: designTemplateLifecycleMessage.text('page.loadFailed'),
    notFound: designTemplateLifecycleMessage.text('page.notFound'),
    retry: designTemplateLifecycleMessage.text('page.retry'),
  },

  readiness: {
    title: designTemplateLifecycleMessage.text('readiness.title'),
    footer: designTemplateLifecycleMessage.text('readiness.footer'),
    /** The advisory legend. The third state is the one that must never read as a pass. */
    legendChecked: designTemplateLifecycleMessage.text('readiness.legendChecked'),
    labels: {
      IMMUTABLE_VERSION: designTemplateLifecycleMessage.text('readiness.labels.IMMUTABLE_VERSION'),
      SCOPE_COMPLETE: designTemplateLifecycleMessage.text('readiness.labels.SCOPE_COMPLETE'),
      DOCUMENT_VALID: designTemplateLifecycleMessage.text('readiness.labels.DOCUMENT_VALID'),
      SCOPE_ACTIVE: designTemplateLifecycleMessage.text('readiness.labels.SCOPE_ACTIVE'),
      PLACEMENT_MATCHES: designTemplateLifecycleMessage.text('readiness.labels.PLACEMENT_MATCHES'),
      WITHIN_AREA: designTemplateLifecycleMessage.text('readiness.labels.WITHIN_AREA'),
      MEDIA_ELIGIBLE: designTemplateLifecycleMessage.text('readiness.labels.MEDIA_ELIGIBLE'),
    },
    details: {
      versionSaved: designTemplateLifecycleMessage.text('readiness.details.versionSaved'),
      versionMissing: designTemplateLifecycleMessage.text('readiness.details.versionMissing'),
      scopePresent: designTemplateLifecycleMessage.text('readiness.details.scopePresent'),
      scopeMissing: designTemplateLifecycleMessage.text('readiness.details.scopeMissing'),
      documentValid: designTemplateLifecycleMessage.text('readiness.details.documentValid'),
      documentInvalid: designTemplateLifecycleMessage.text('readiness.details.documentInvalid'),
      scopeActive: designTemplateLifecycleMessage.text('readiness.details.scopeActive'),
      scopeRetired: designTemplateLifecycleMessage.text('readiness.details.scopeRetired'),
      scopeNotRead: designTemplateLifecycleMessage.text('readiness.details.scopeNotRead'),
      placementMatches: designTemplateLifecycleMessage.text('readiness.details.placementMatches'),
      placementMismatch: designTemplateLifecycleMessage.text('readiness.details.placementMismatch'),
      withinArea: designTemplateLifecycleMessage.text('readiness.details.withinArea'),
      outOfBounds: designTemplateLifecycleMessage.text('readiness.details.outOfBounds'),
      geometryNotEvaluable: designTemplateLifecycleMessage.text(
        'readiness.details.geometryNotEvaluable',
      ),
      noVersionYet: designTemplateLifecycleMessage.text('readiness.details.noVersionYet'),
      mediaNoneReferenced: designTemplateLifecycleMessage.text(
        'readiness.details.mediaNoneReferenced',
      ),
      mediaCheckedOnPublish: designTemplateLifecycleMessage.text(
        'readiness.details.mediaCheckedOnPublish',
      ),
    },
  },

  actions: {
    title: designTemplateLifecycleMessage.text('actions.title'),
    readyHeading: designTemplateLifecycleMessage.text('actions.readyHeading'),
    readyBody: designTemplateLifecycleMessage.text('actions.readyBody'),
    advisoryHeading: designTemplateLifecycleMessage.text('actions.advisoryHeading'),
    advisoryBody: designTemplateLifecycleMessage.text('actions.advisoryBody'),
    blockedBadge: designTemplateLifecycleMessage.text('actions.blockedBadge'),
    blockedBody: designTemplateLifecycleMessage.text('actions.blockedBody'),
    blockedCount: designTemplateLifecycleMessage.text('actions.blockedCount'),
    publish: designTemplateLifecycleMessage.text('actions.publish'),
    publishNote: designTemplateLifecycleMessage.text('actions.publishNote'),
    unpublish: designTemplateLifecycleMessage.text('actions.unpublish'),
    unpublishNote: designTemplateLifecycleMessage.text('actions.unpublishNote'),
    publishedHeading: designTemplateLifecycleMessage.text('actions.publishedHeading'),
    publishedBody: designTemplateLifecycleMessage.text('actions.publishedBody'),
    dangerZone: designTemplateLifecycleMessage.text('actions.dangerZone'),
    archive: designTemplateLifecycleMessage.text('actions.archive'),
    archiveNote: designTemplateLifecycleMessage.text('actions.archiveNote'),
    fixListTitle: designTemplateLifecycleMessage.text('actions.fixListTitle'),
    fixListFooter: designTemplateLifecycleMessage.text('actions.fixListFooter'),
  },

  archived: {
    title: designTemplateLifecycleMessage.text('archived.title'),
    heading: designTemplateLifecycleMessage.text('archived.heading'),
    body: designTemplateLifecycleMessage.text('archived.body'),
    bodyNoDate: designTemplateLifecycleMessage.text('archived.bodyNoDate'),
    reasonNote: designTemplateLifecycleMessage.text('archived.reasonNote'),
    restore: designTemplateLifecycleMessage.text('archived.restore'),
    restoreNote: designTemplateLifecycleMessage.text('archived.restoreNote'),
  },

  publishDialog: {
    title: designTemplateLifecycleMessage.text('publishDialog.title'),
    body: designTemplateLifecycleMessage.text('publishDialog.body'),
    bodyNoScope: designTemplateLifecycleMessage.text('publishDialog.bodyNoScope'),
    version: designTemplateLifecycleMessage.text('publishDialog.version'),
    confirm: designTemplateLifecycleMessage.text('publishDialog.confirm'),
    cancel: designTemplateLifecycleMessage.text('publishDialog.cancel'),
  },

  unpublishDialog: {
    title: designTemplateLifecycleMessage.text('unpublishDialog.title'),
    body: designTemplateLifecycleMessage.text('unpublishDialog.body'),
    confirm: designTemplateLifecycleMessage.text('unpublishDialog.confirm'),
    cancel: designTemplateLifecycleMessage.text('unpublishDialog.cancel'),
  },

  archiveDialog: {
    badge: designTemplateLifecycleMessage.text('archiveDialog.badge'),
    title: designTemplateLifecycleMessage.text('archiveDialog.title'),
    body: designTemplateLifecycleMessage.text('archiveDialog.body'),
    reasonLabel: designTemplateLifecycleMessage.text('archiveDialog.reasonLabel'),
    reasonHint: designTemplateLifecycleMessage.text('archiveDialog.reasonHint'),
    confirm: designTemplateLifecycleMessage.text('archiveDialog.confirm'),
    cancel: designTemplateLifecycleMessage.text('archiveDialog.cancel'),
  },

  restoreDialog: {
    badge: designTemplateLifecycleMessage.text('restoreDialog.badge'),
    title: designTemplateLifecycleMessage.text('restoreDialog.title'),
    body: designTemplateLifecycleMessage.text('restoreDialog.body'),
    reasonLabel: designTemplateLifecycleMessage.text('restoreDialog.reasonLabel'),
    reasonHint: designTemplateLifecycleMessage.text('restoreDialog.reasonHint'),
    confirm: designTemplateLifecycleMessage.text('restoreDialog.confirm'),
    cancel: designTemplateLifecycleMessage.text('restoreDialog.cancel'),
  },

  reason: {
    blank: designTemplateLifecycleMessage.text('reason.blank'),
    tooLong: designTemplateLifecycleMessage.text('reason.tooLong'),
  },

  outcome: {
    published: designTemplateLifecycleMessage.text('outcome.published'),
    unpublished: designTemplateLifecycleMessage.text('outcome.unpublished'),
    archived: designTemplateLifecycleMessage.text('outcome.archived'),
    restored: designTemplateLifecycleMessage.text('outcome.restored'),
    working: designTemplateLifecycleMessage.text('outcome.working'),
  },

  failure: {
    /**
     * The publish refusal. It names no condition on purpose: the wire publishes
     * no per-guard discriminator, and inventing one would tell the operator to
     * fix something the server may not have objected to.
     */
    notReady: designTemplateLifecycleMessage.text('failure.notReady'),
    staleReloaded: designTemplateLifecycleMessage.text('failure.staleReloaded'),
    staleReasonCleared: designTemplateLifecycleMessage.text('failure.staleReasonCleared'),
    rejected: designTemplateLifecycleMessage.text('failure.rejected'),
    unauthenticated: designTemplateLifecycleMessage.text('failure.unauthenticated'),
    missing: designTemplateLifecycleMessage.text('failure.missing'),
    generic: designTemplateLifecycleMessage.text('failure.generic'),
  },
} as const;

/** Substitutes the single `{value}`/`{count}` placeholder the catalogue uses. */
export function withValue(template: string, value: string): string {
  return template.replace('{value}', value).replace('{count}', value);
}

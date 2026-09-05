/**
 * Vietnamese copy catalog for the Admin asset library (FRONTEND_CONVENTIONS
 * §14 — no user-facing string is written at a call site).
 *
 * Every string that appears in an approved Figma node is reproduced verbatim
 * from `FIG-ADMIN-ASSETS-*` (`426:13`, `429:6`, `429:89`, `430:12`, `430:98`,
 * `432:18`, `433:19`) and the normative handoff nodes `450:404` / `484:272`.
 * The few strings the frames do not enumerate — terminal acceptance, an
 * ambiguous cancellation, the safe API-failure fallbacks — are written in the
 * same register and never expose a technical detail.
 *
 * Deliberately absent: any sentence stating the maximum file size. The approved
 * handoff pins the support line to formats only, so the too-large guidance
 * names the outcome rather than advertising a number.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `assets`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const assetsMessage = messageView(VI_MESSAGES.admin, 'assets');

export const ASSET_COPY = {
  page: {
    /** The screen's single `<h1>`, and the navigation label for `/assets`. */
    title: assetsMessage.text('page.title'),
    subtitle: assetsMessage.text('page.subtitle'),
    collectionLabel: assetsMessage.text('page.collectionLabel'),
  },

  upload: {
    action: assetsMessage.text('upload.action'),
    dropTitle: assetsMessage.text('upload.dropTitle'),
    dropHint: assetsMessage.text('upload.dropHint'),
    browse: assetsMessage.text('upload.browse'),
    formats: assetsMessage.text('upload.formats'),
    mobileHint: assetsMessage.text('upload.mobileHint'),
    /** Accessible name of the visually hidden native input. */
    inputLabel: assetsMessage.text('upload.inputLabel'),
    selectedTitle: assetsMessage.text('upload.selectedTitle'),
    selectedDescription: assetsMessage.text('upload.selectedDescription'),
    submit: assetsMessage.text('upload.submit'),
    clear: assetsMessage.text('upload.clear'),
  },

  progress: {
    uploadingTitle: assetsMessage.text('progress.uploadingTitle'),
    determinate: assetsMessage.text('progress.determinate'),
    indeterminate: assetsMessage.text('progress.indeterminate'),
    label: assetsMessage.text('progress.label'),
    cancel: assetsMessage.text('progress.cancel'),
  },

  processing: {
    title: assetsMessage.text('processing.title'),
    description: assetsMessage.text('processing.description'),
  },

  accepted: {
    title: assetsMessage.text('accepted.title'),
    description: assetsMessage.text('accepted.description'),
  },

  rejected: {
    title: assetsMessage.text('rejected.title'),
    description: assetsMessage.text('rejected.description'),
    action: assetsMessage.text('rejected.action'),
  },

  unknownState: {
    title: assetsMessage.text('unknownState.title'),
    description: assetsMessage.text('unknownState.description'),
  },

  cancelled: {
    title: assetsMessage.text('cancelled.title'),
    description: assetsMessage.text('cancelled.description'),
    retry: assetsMessage.text('cancelled.retry'),
    dismiss: assetsMessage.text('cancelled.dismiss'),
  },

  uploadError: {
    title: assetsMessage.text('uploadError.title'),
    retry: assetsMessage.text('uploadError.retry'),
    dismiss: assetsMessage.text('uploadError.dismiss'),
  },

  status: {
    pending: assetsMessage.text('status.pending'),
    processing: assetsMessage.text('status.processing'),
    ready: assetsMessage.text('status.ready'),
    rejected: assetsMessage.text('status.rejected'),
    unknown: assetsMessage.text('status.unknown'),
  },

  identity: {
    titlePng: assetsMessage.text('identity.titlePng'),
    titleJpeg: assetsMessage.text('identity.titleJpeg'),
    titleWebp: assetsMessage.text('identity.titleWebp'),
    titleUnknown: assetsMessage.text('identity.titleUnknown'),
    unitBytes: assetsMessage.text('identity.unitBytes'),
    unitKilobytes: assetsMessage.text('identity.unitKilobytes'),
    unitMegabytes: assetsMessage.text('identity.unitMegabytes'),
    metaUnavailable: assetsMessage.text('identity.metaUnavailable'),
    /** Accessible description of the placeholder tile — there is no image yet. */
    thumbnailPlaceholder: assetsMessage.text('identity.thumbnailPlaceholder'),
  },

  list: {
    loading: assetsMessage.text('list.loading'),
    unavailableTitle: assetsMessage.text('list.unavailableTitle'),
    unavailableDescription: assetsMessage.text('list.unavailableDescription'),
    unavailableRetry: assetsMessage.text('list.unavailableRetry'),
    emptyTitle: assetsMessage.text('list.emptyTitle'),
    emptyDescription: assetsMessage.text('list.emptyDescription'),
  },

  continuation: {
    action: assetsMessage.text('continuation.action'),
    loading: assetsMessage.text('continuation.loading'),
    loaded: assetsMessage.text('continuation.loaded'),
    errorMessage: assetsMessage.text('continuation.errorMessage'),
    retry: assetsMessage.text('continuation.retry'),
  },

  /**
   * Safe outcomes for a failed upload. Keyed by the API's stable business code
   * (or the api-client transport code) — never by an HTTP body, a native error
   * or an inspection detail. Anything unmapped falls back to `unexpected`.
   */
  errors: {
    mediaUnsupported: assetsMessage.text('errors.mediaUnsupported'),
    tooLarge: assetsMessage.text('errors.tooLarge'),
    multipleFiles: assetsMessage.text('errors.multipleFiles'),
    signatureMismatch: assetsMessage.text('errors.signatureMismatch'),
    metadataInvalid: assetsMessage.text('errors.metadataInvalid'),
    idempotencyConflict: assetsMessage.text('errors.idempotencyConflict'),
    uploadInProgress: assetsMessage.text('errors.uploadInProgress'),
    stateConflict: assetsMessage.text('errors.stateConflict'),
    timeout: assetsMessage.text('errors.timeout'),
    unavailable: assetsMessage.text('errors.unavailable'),
    rateLimited: assetsMessage.text('errors.rateLimited'),
    network: assetsMessage.text('errors.network'),
    notFound: assetsMessage.text('errors.notFound'),
    sessionExpired: assetsMessage.text('errors.sessionExpired'),
    unexpected: assetsMessage.text('errors.unexpected'),
  },
} as const;

/** Substitutes a single `{token}` placeholder; no user input is interpolated. */
export function withToken(template: string, token: string, value: string): string {
  return template.replace(`{${token}}`, value);
}

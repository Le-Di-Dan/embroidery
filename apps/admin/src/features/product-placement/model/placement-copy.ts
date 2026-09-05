/**
 * Vietnamese copy catalog for Admin placement authoring (`APP3-A01`).
 *
 * Reproduced from the approved nodes `FIG-ADMIN-PLACEMENT-DESKTOP-{DEFAULT,
 * AREAEDIT,VALIDATION,LOADING}` (section `596:7`) and the narrow-desktop
 * reference `FIG-ADMIN-PLACEMENT-NARROW-1280` (`618:74`).
 *
 * Three rules shape what may appear here.
 *
 * *Retirement is never described as deletion.* `IMP-D041` PO-07 retires a side
 * or area and keeps it forever, because a Template or a live Design Session may
 * still reference it. Copy that said "xoá" would promise something the system
 * deliberately cannot do.
 *
 * *No string names a storage internal.* Not a bucket, an object key, a
 * derivative, a checksum or a URL. The operator picks an Asset; everything
 * about how it is stored is invisible here.
 *
 * *A failure message never echoes the server.* The server's message may name a
 * table or a constraint. Every string below is fixed, chosen by the code alone.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `placement`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const placementMessage = messageView(VI_MESSAGES.adminWave2, 'placement');

export const PLACEMENT_COPY = {
  screen: {
    title: placementMessage.text('screen.title'),
    subtitle: placementMessage.text('screen.subtitle'),
    backToProduct: placementMessage.text('screen.backToProduct'),
  },

  entry: {
    label: placementMessage.text('entry.label'),
  },

  states: {
    loading: placementMessage.text('states.loading'),
    notFoundTitle: placementMessage.text('states.notFoundTitle'),
    notFoundBody: placementMessage.text('states.notFoundBody'),
    unavailableTitle: placementMessage.text('states.unavailableTitle'),
    unavailableBody: placementMessage.text('states.unavailableBody'),
    retry: placementMessage.text('states.retry'),
    backToList: placementMessage.text('states.backToList'),
    emptyTitle: placementMessage.text('states.emptyTitle'),
    emptyBody: placementMessage.text('states.emptyBody'),
  },

  hierarchy: {
    title: placementMessage.text('hierarchy.title'),
    productLabel: placementMessage.text('hierarchy.productLabel'),
    sidesLabel: placementMessage.text('hierarchy.sidesLabel'),
    areasLabel: placementMessage.text('hierarchy.areasLabel'),
    addSide: placementMessage.text('hierarchy.addSide'),
    addArea: placementMessage.text('hierarchy.addArea'),
    /**
     * Retirement, never deletion — the row stays as history.
     *
     * Deliberately short. The hierarchy column is 296px at 1440 and narrower at
     * 1280, and a longer label wrapped to four lines and squeezed the row name
     * it sits beside. What is being retired is unambiguous from the row.
     */
    retireSide: placementMessage.text('hierarchy.retireSide'),
    retireArea: placementMessage.text('hierarchy.retireArea'),
    undoRetire: placementMessage.text('hierarchy.undoRetire'),
    retiredBadge: placementMessage.text('hierarchy.retiredBadge'),
    pendingRetireBadge: placementMessage.text('hierarchy.pendingRetireBadge'),
    supersededBadge: placementMessage.text('hierarchy.supersededBadge'),
    newBadge: placementMessage.text('hierarchy.newBadge'),
    noAreas: placementMessage.text('hierarchy.noAreas'),
    unnamedSide: placementMessage.text('hierarchy.unnamedSide'),
    unnamedArea: placementMessage.text('hierarchy.unnamedArea'),
  },

  preview: {
    title: placementMessage.text('preview.title'),
    empty: placementMessage.text('preview.empty'),
    /** Alt-equivalent for the background layer; never a filename. */
    backgroundAlt: (side: string) => placementMessage.text('preview.backgroundAlt', { side }),
    backgroundLoading: placementMessage.text('preview.backgroundLoading'),
    /** `404` — the server will not resolve a background here; retrying cannot help. */
    backgroundUnavailable: placementMessage.text('preview.backgroundUnavailable'),
    /** `503`/transport — the row says it exists, so trying again is the right advice. */
    backgroundFailed: placementMessage.text('preview.backgroundFailed'),
    backgroundRetry: placementMessage.text('preview.backgroundRetry'),
    /**
     * A background Asset was chosen but not saved yet. The server still serves
     * the previous one, so nothing is drawn rather than showing bytes that would
     * misrepresent the pending choice.
     */
    backgroundPending: placementMessage.text('preview.backgroundPending'),
    /** A Side that has never been saved has no address to fetch from. */
    backgroundUnsavedSide: placementMessage.text('preview.backgroundUnsavedSide'),
    canvasLabel: (width: number, height: number) =>
      placementMessage.text('preview.canvasLabel', { width, height }),
    areaLabel: (name: string) => placementMessage.text('preview.areaLabel', { name }),
    outsideCanvas: placementMessage.text('preview.outsideCanvas'),
    safeBoundary: placementMessage.text('preview.safeBoundary'),
  },

  inspector: {
    title: placementMessage.text('inspector.title'),
    empty: placementMessage.text('inspector.empty'),
    sideSection: placementMessage.text('inspector.sideSection'),
    areaSection: placementMessage.text('inspector.areaSection'),
    readOnlyRetired: placementMessage.text('inspector.readOnlyRetired'),
  },

  fields: {
    code: placementMessage.text('fields.code'),
    codeHelp: placementMessage.text('fields.codeHelp'),
    name: placementMessage.text('fields.name'),
    nameHelp: placementMessage.text('fields.nameHelp'),
    displayOrder: placementMessage.text('fields.displayOrder'),
    displayOrderHelp: placementMessage.text('fields.displayOrderHelp'),
    backgroundAsset: placementMessage.text('fields.backgroundAsset'),
    backgroundAssetHelp: placementMessage.text('fields.backgroundAssetHelp'),
    chooseBackground: placementMessage.text('fields.chooseBackground'),
    changeBackground: placementMessage.text('fields.changeBackground'),
    imageWidthPx: placementMessage.text('fields.imageWidthPx'),
    imageHeightPx: placementMessage.text('fields.imageHeightPx'),
    physicalWidthMm: placementMessage.text('fields.physicalWidthMm'),
    physicalHeightMm: placementMessage.text('fields.physicalHeightMm'),
    pxPerMm: placementMessage.text('fields.pxPerMm'),
    pxPerMmHelp: placementMessage.text('fields.pxPerMmHelp'),
    boundXPx: placementMessage.text('fields.boundXPx'),
    boundYPx: placementMessage.text('fields.boundYPx'),
    boundWidthPx: placementMessage.text('fields.boundWidthPx'),
    boundHeightPx: placementMessage.text('fields.boundHeightPx'),
    maxWidthMm: placementMessage.text('fields.maxWidthMm'),
    maxHeightMm: placementMessage.text('fields.maxHeightMm'),
    maxHelp: placementMessage.text('fields.maxHelp'),
  },

  validation: {
    required: placementMessage.text('validation.required'),
    notNumber: placementMessage.text('validation.notNumber'),
    notPositive: placementMessage.text('validation.notPositive'),
    negative: placementMessage.text('validation.negative'),
    tooLarge: placementMessage.text('validation.tooLarge'),
    codeFormat: placementMessage.text('validation.codeFormat'),
    nameLength: placementMessage.text('validation.nameLength'),
    orderRange: placementMessage.text('validation.orderRange'),
    outsideCanvas: placementMessage.text('validation.outsideCanvas'),
    scaleMismatch: placementMessage.text('validation.scaleMismatch'),
    duplicateCode: placementMessage.text('validation.duplicateCode'),
    summaryTitle: placementMessage.text('validation.summaryTitle'),
    summaryBody: placementMessage.text('validation.summaryBody'),
  },

  save: {
    action: placementMessage.text('save.action'),
    saving: placementMessage.text('save.saving'),
    saved: placementMessage.text('save.saved'),
    unsaved: placementMessage.text('save.unsaved'),
    clean: placementMessage.text('save.clean'),
    discard: placementMessage.text('save.discard'),
  },

  failure: {
    genericTitle: placementMessage.text('failure.genericTitle'),
    genericBody: placementMessage.text('failure.genericBody'),
    invalidTitle: placementMessage.text('failure.invalidTitle'),
    invalidBody: placementMessage.text('failure.invalidBody'),
    geometryTitle: placementMessage.text('failure.geometryTitle'),
    geometryBody: placementMessage.text('failure.geometryBody'),
    immutableTitle: placementMessage.text('failure.immutableTitle'),
    immutableBody: placementMessage.text('failure.immutableBody'),
    backgroundTitle: placementMessage.text('failure.backgroundTitle'),
    backgroundBody: placementMessage.text('failure.backgroundBody'),
    networkTitle: placementMessage.text('failure.networkTitle'),
    networkBody: placementMessage.text('failure.networkBody'),
  },

  conflict: {
    title: placementMessage.text('conflict.title'),
    body: placementMessage.text('conflict.body'),
    keepNote: placementMessage.text('conflict.keepNote'),
    reload: placementMessage.text('conflict.reload'),
    keep: placementMessage.text('conflict.keep'),
    banner: placementMessage.text('conflict.banner'),
  },

  picker: {
    title: placementMessage.text('picker.title'),
    help: placementMessage.text('picker.help'),
    loading: placementMessage.text('picker.loading'),
    emptyTitle: placementMessage.text('picker.emptyTitle'),
    emptyBody: placementMessage.text('picker.emptyBody'),
    unavailableTitle: placementMessage.text('picker.unavailableTitle'),
    unavailableBody: placementMessage.text('picker.unavailableBody'),
    retry: placementMessage.text('picker.retry'),
    loadMore: placementMessage.text('picker.loadMore'),
    loadingMore: placementMessage.text('picker.loadingMore'),
    loadMoreFailed: placementMessage.text('picker.loadMoreFailed'),
    cancel: placementMessage.text('picker.cancel'),
    confirm: placementMessage.text('picker.confirm'),
    selected: placementMessage.text('picker.selected'),
    /**
     * Picker tiles stay placeholders after `APP3-A01-C1`.
     *
     * `APP3-B02A` delivers a background by **Product + Side**, which is the
     * association it authorizes. There is no asset-by-id delivery route, and
     * inventing one to draw thumbnails is exactly the bypass `APP3-A01-C1` §10
     * forbids — so the picker names the media type it can prove and nothing it
     * cannot show.
     */
    thumbnailPlaceholder: placementMessage.text('picker.thumbnailPlaceholder'),
  },

  mobile: {
    title: placementMessage.text('mobile.title'),
    body: placementMessage.text('mobile.body'),
    readOnlyBadge: placementMessage.text('mobile.readOnlyBadge'),
  },
} as const;

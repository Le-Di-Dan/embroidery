/**
 * Vietnamese copy catalog for the Admin Design Template editor (`APP3-A03`).
 *
 * Reproduced from the approved nodes `FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-
 * {DEFAULT,TEXTSELECTED,SAVING,CONFLICT}`, `FIG-ADMIN-TEMPLATEEDITOR-MOBILE-
 * READONLY` and `FIG-ADMIN-TEMPLATEEDITOR-NARROW-1280` (section `596:9`,
 * `618:3`).
 *
 * Four rules shape what may appear here.
 *
 * *The conflict never reads as "your change won".* `APP3-D01` §I.3 makes this a
 * design decision rather than a wording preference: the dialog states that the
 * server was **not** overwritten, offers exactly two choices, and says plainly
 * that keeping the local draft keeps it in this browser only.
 *
 * *Nothing claims a capability that has not shipped.* Adding a Template image
 * needs a `TEMPLATE_SOURCE` Asset, and no accepted API creates one. The control
 * is drawn, disabled and labelled with what it waits for — `APP3-D01` §I.1's
 * disabled-with-a-reason rule — never hidden and never wired to a substitute.
 *
 * *An absence is stated, never implied.* A Template with no placement scope, an
 * image whose bytes cannot be shown, and a Product whose Side no longer resolves
 * each get their own sentence.
 *
 * *No string exposes an internal.* No storage key, bucket, provider message,
 * SQL fragment or error code reaches this catalog; the conflict names the
 * situation, not the wire format.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `designTemplateEditor`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const designTemplateEditorMessage = messageView(VI_MESSAGES.adminWave2, 'designTemplateEditor');

export const DESIGN_TEMPLATE_EDITOR_COPY = {
  page: {
    backToList: designTemplateEditorMessage.text('page.backToList'),
    /** The one `APP3-A04` affordance: navigation, never a lifecycle command. */
    managePublication: designTemplateEditorMessage.text('page.managePublication'),
    loading: designTemplateEditorMessage.text('page.loading'),
    notFoundTitle: designTemplateEditorMessage.text('page.notFoundTitle'),
    notFoundBody: designTemplateEditorMessage.text('page.notFoundBody'),
    loadFailedTitle: designTemplateEditorMessage.text('page.loadFailedTitle'),
    loadFailedBody: designTemplateEditorMessage.text('page.loadFailedBody'),
    retry: designTemplateEditorMessage.text('page.retry'),
  },

  status: {
    draft: designTemplateEditorMessage.text('status.draft'),
    published: designTemplateEditorMessage.text('status.published'),
    archived: designTemplateEditorMessage.text('status.archived'),
    unknown: designTemplateEditorMessage.text('status.unknown'),
  },

  version: {
    /** Truthful for a header `APP3-B03` created and `APP3-B03A` has not saved. */
    none: designTemplateEditorMessage.text('version.none'),
    current: (version: number) => designTemplateEditorMessage.text('version.current', { version }),
  },

  save: {
    action: designTemplateEditorMessage.text('save.action'),
    /** The chip. Four states, and `conflict` is not a kind of error. */
    chipSaved: designTemplateEditorMessage.text('save.chipSaved'),
    chipUnsaved: designTemplateEditorMessage.text('save.chipUnsaved'),
    chipSaving: designTemplateEditorMessage.text('save.chipSaving'),
    chipConflict: designTemplateEditorMessage.text('save.chipConflict'),
    /** Announced politely so a save does not interrupt an operator mid-edit. */
    announcedSaved: (version: number) =>
      designTemplateEditorMessage.text('save.announcedSaved', { version }),
    announcedSaving: designTemplateEditorMessage.text('save.announcedSaving'),
    failedTitle: designTemplateEditorMessage.text('save.failedTitle'),
    failedBody: designTemplateEditorMessage.text('save.failedBody'),
    rejectedTitle: designTemplateEditorMessage.text('save.rejectedTitle'),
    rejectedBody: designTemplateEditorMessage.text('save.rejectedBody'),
    notEditableTitle: designTemplateEditorMessage.text('save.notEditableTitle'),
    notEditableBody: designTemplateEditorMessage.text('save.notEditableBody'),
  },

  conflict: {
    title: designTemplateEditorMessage.text('conflict.title'),
    /** The load-bearing sentence: nothing of the operator's was written. */
    notOverwritten: designTemplateEditorMessage.text('conflict.notOverwritten'),
    body: designTemplateEditorMessage.text('conflict.body'),
    noMerge: designTemplateEditorMessage.text('conflict.noMerge'),
    reload: designTemplateEditorMessage.text('conflict.reload'),
    reloadHelp: designTemplateEditorMessage.text('conflict.reloadHelp'),
    keepLocal: designTemplateEditorMessage.text('conflict.keepLocal'),
    keepLocalHelp: designTemplateEditorMessage.text('conflict.keepLocalHelp'),
    /** Shown persistently after the dialog closes, so nothing looks saved. */
    banner: designTemplateEditorMessage.text('conflict.banner'),
    reloadDiscardTitle: designTemplateEditorMessage.text('conflict.reloadDiscardTitle'),
    reloadDiscardBody: designTemplateEditorMessage.text('conflict.reloadDiscardBody'),
    reloadDiscardConfirm: designTemplateEditorMessage.text('conflict.reloadDiscardConfirm'),
    reloadDiscardCancel: designTemplateEditorMessage.text('conflict.reloadDiscardCancel'),
  },

  unsaved: {
    title: designTemplateEditorMessage.text('unsaved.title'),
    body: designTemplateEditorMessage.text('unsaved.body'),
    leave: designTemplateEditorMessage.text('unsaved.leave'),
    stay: designTemplateEditorMessage.text('unsaved.stay'),
  },

  readOnly: {
    publishedTitle: designTemplateEditorMessage.text('readOnly.publishedTitle'),
    archivedTitle: designTemplateEditorMessage.text('readOnly.archivedTitle'),
    body: designTemplateEditorMessage.text('readOnly.body'),
  },

  mobile: {
    title: designTemplateEditorMessage.text('mobile.title'),
    body: designTemplateEditorMessage.text('mobile.body'),
  },

  scope: {
    title: designTemplateEditorMessage.text('scope.title'),
    none: designTemplateEditorMessage.text('scope.none'),
    /**
     * The unscoped Template that can **no longer** be assigned one.
     *
     * `APP3-B03B` admits an initial assignment only for a versionless `DRAFT`,
     * so this state is a Template that lost its eligibility — it has a version,
     * or it left `DRAFT`. Until `APP3-A03-C1` this sentence said no assignment
     * operation existed at all, which was true then and would be a lie now.
     *
     * The assignable case never reaches here: it gets the selector instead.
     */
    noneBody: designTemplateEditorMessage.text('scope.noneBody'),
    unresolvedTitle: designTemplateEditorMessage.text('scope.unresolvedTitle'),
    unresolvedBody: designTemplateEditorMessage.text('scope.unresolvedBody'),
    loading: designTemplateEditorMessage.text('scope.loading'),
    failedTitle: designTemplateEditorMessage.text('scope.failedTitle'),
    failedBody: designTemplateEditorMessage.text('scope.failedBody'),
    product: (name: string) => designTemplateEditorMessage.text('scope.product', { name }),
    side: (name: string) => designTemplateEditorMessage.text('scope.side', { name }),
    area: (name: string) => designTemplateEditorMessage.text('scope.area', { name }),
    canvas: (width: number, height: number) =>
      designTemplateEditorMessage.text('scope.canvas', {
        width,
        height,
      }),
  },

  /**
   * The one-time initial scope assignment (`APP3-A03-C1`).
   *
   * The copy never says "change" or "edit" anywhere: `APP3-B03B` publishes no
   * rescope, so a word implying one would promise a capability that does not
   * exist. It says *assign*, once, and afterwards the scope is context.
   */
  assign: {
    title: designTemplateEditorMessage.text('assign.title'),
    intro: designTemplateEditorMessage.text('assign.intro'),
    productLabel: designTemplateEditorMessage.text('assign.productLabel'),
    productPlaceholder: designTemplateEditorMessage.text('assign.productPlaceholder'),
    productLoading: designTemplateEditorMessage.text('assign.productLoading'),
    productFailedTitle: designTemplateEditorMessage.text('assign.productFailedTitle'),
    productFailedBody: designTemplateEditorMessage.text('assign.productFailedBody'),
    productEmpty: designTemplateEditorMessage.text('assign.productEmpty'),
    sideLabel: designTemplateEditorMessage.text('assign.sideLabel'),
    sidePlaceholder: designTemplateEditorMessage.text('assign.sidePlaceholder'),
    sideLoading: designTemplateEditorMessage.text('assign.sideLoading'),
    sideFailedTitle: designTemplateEditorMessage.text('assign.sideFailedTitle'),
    sideFailedBody: designTemplateEditorMessage.text('assign.sideFailedBody'),
    /** Truthful: retired rows exist but may not be chosen for a *new* scope. */
    sideEmpty: designTemplateEditorMessage.text('assign.sideEmpty'),
    areaLabel: designTemplateEditorMessage.text('assign.areaLabel'),
    areaPlaceholder: designTemplateEditorMessage.text('assign.areaPlaceholder'),
    areaEmpty: designTemplateEditorMessage.text('assign.areaEmpty'),
    submit: designTemplateEditorMessage.text('assign.submit'),
    submitting: designTemplateEditorMessage.text('assign.submitting'),
    /** Why the button is disabled, stated rather than left to be guessed. */
    incomplete: designTemplateEditorMessage.text('assign.incomplete'),
    retry: designTemplateEditorMessage.text('assign.retry'),
    assignedAnnouncement: designTemplateEditorMessage.text('assign.assignedAnnouncement'),
    notAssignableTitle: designTemplateEditorMessage.text('assign.notAssignableTitle'),
    notAssignableBody: designTemplateEditorMessage.text('assign.notAssignableBody'),
    invalidTitle: designTemplateEditorMessage.text('assign.invalidTitle'),
    invalidBody: designTemplateEditorMessage.text('assign.invalidBody'),
    failedTitle: designTemplateEditorMessage.text('assign.failedTitle'),
    failedBody: designTemplateEditorMessage.text('assign.failedBody'),
  },

  background: {
    loading: designTemplateEditorMessage.text('background.loading'),
    unavailable: designTemplateEditorMessage.text('background.unavailable'),
    failed: designTemplateEditorMessage.text('background.failed'),
    retry: designTemplateEditorMessage.text('background.retry'),
  },

  stage: {
    title: designTemplateEditorMessage.text('stage.title'),
    label: (width: number, height: number) =>
      designTemplateEditorMessage.text('stage.label', {
        width,
        height,
      }),
    empty: designTemplateEditorMessage.text('stage.empty'),
    outOfBounds: designTemplateEditorMessage.text('stage.outOfBounds'),
    /**
     * A draft may legitimately sit outside the area — `APP3-B04` owns the
     * publication guard, and refusing a save here would be a second, weaker
     * definition of publishable.
     */
    outOfBoundsNote: designTemplateEditorMessage.text('stage.outOfBoundsNote'),
  },

  layers: {
    title: designTemplateEditorMessage.text('layers.title'),
    empty: designTemplateEditorMessage.text('layers.empty'),
    unnamedText: designTemplateEditorMessage.text('layers.unnamedText'),
    typeText: designTemplateEditorMessage.text('layers.typeText'),
    typeImage: designTemplateEditorMessage.text('layers.typeImage'),
    typeShape: designTemplateEditorMessage.text('layers.typeShape'),
    typeFreehand: designTemplateEditorMessage.text('layers.typeFreehand'),
    typeGroup: designTemplateEditorMessage.text('layers.typeGroup'),
    hidden: designTemplateEditorMessage.text('layers.hidden'),
    locked: designTemplateEditorMessage.text('layers.locked'),
    selected: designTemplateEditorMessage.text('layers.selected'),
    /** Document order is bottom-first; the list shows top-first, and says so. */
    orderNote: designTemplateEditorMessage.text('layers.orderNote'),
    addText: designTemplateEditorMessage.text('layers.addText'),
    addTextLimit: designTemplateEditorMessage.text('layers.addTextLimit'),
    remove: designTemplateEditorMessage.text('layers.remove'),
  },

  image: {
    /** Visible, disabled, and labelled with what it waits for. */
    add: designTemplateEditorMessage.text('image.add'),
    addDisabled: designTemplateEditorMessage.text('image.addDisabled'),
    addDisabledReason: designTemplateEditorMessage.text('image.addDisabledReason'),
    /**
     * There is no authenticated Admin route that serves Template draft asset
     * bytes, so the element is drawn as an honest empty frame. Its Asset id is
     * deliberately not used as a label — an internal identifier is not a name.
     */
    placeholder: designTemplateEditorMessage.text('image.placeholder'),
    placeholderNote: designTemplateEditorMessage.text('image.placeholderNote'),
  },

  inspector: {
    title: designTemplateEditorMessage.text('inspector.title'),
    none: designTemplateEditorMessage.text('inspector.none'),
    unsupported: designTemplateEditorMessage.text('inspector.unsupported'),
    textSection: designTemplateEditorMessage.text('inspector.textSection'),
    transformSection: designTemplateEditorMessage.text('inspector.transformSection'),
    textLabel: designTemplateEditorMessage.text('inspector.textLabel'),
    fontLabel: designTemplateEditorMessage.text('inspector.fontLabel'),
    fontSizeLabel: designTemplateEditorMessage.text('inspector.fontSizeLabel'),
    fontWeightLabel: designTemplateEditorMessage.text('inspector.fontWeightLabel'),
    fontStyleLabel: designTemplateEditorMessage.text('inspector.fontStyleLabel'),
    fontStyleNormal: designTemplateEditorMessage.text('inspector.fontStyleNormal'),
    fontStyleItalic: designTemplateEditorMessage.text('inspector.fontStyleItalic'),
    alignLabel: designTemplateEditorMessage.text('inspector.alignLabel'),
    alignLeft: designTemplateEditorMessage.text('inspector.alignLeft'),
    alignCenter: designTemplateEditorMessage.text('inspector.alignCenter'),
    alignRight: designTemplateEditorMessage.text('inspector.alignRight'),
    fillLabel: designTemplateEditorMessage.text('inspector.fillLabel'),
    xLabel: designTemplateEditorMessage.text('inspector.xLabel'),
    yLabel: designTemplateEditorMessage.text('inspector.yLabel'),
    widthLabel: designTemplateEditorMessage.text('inspector.widthLabel'),
    heightLabel: designTemplateEditorMessage.text('inspector.heightLabel'),
    rotationLabel: designTemplateEditorMessage.text('inspector.rotationLabel'),
    invalidNumber: designTemplateEditorMessage.text('inspector.invalidNumber'),
    /** The controlled registry is the only source of a font (IMP-D044 PO-10). */
    fontNote: designTemplateEditorMessage.text('inspector.fontNote'),
  },
} as const;

/**
 * Vietnamese copy catalog for the Admin Design Template list (`APP3-A02`).
 *
 * Reproduced from the approved nodes `FIG-ADMIN-TEMPLATELIST-DESKTOP-{DEFAULT,
 * LOADING,EMPTY,ERROR}` and `FIG-ADMIN-TEMPLATELIST-MOBILE-DEFAULT`
 * (section `596:8`).
 *
 * Three rules shape what may appear here.
 *
 * *Nothing claims a capability `APP3-B03` does not have.* No search box, no
 * sort, no page number, no total. The toolbar says so explicitly rather than
 * leaving the operator to wonder where the search field went.
 *
 * *Absence is stated, never implied.* A template with no version and a draft
 * with no placement scope each get their own sentence. An empty cell would read
 * as a rendering bug; "—" alone would read as zero.
 *
 * *No string promises what does not exist.* The row affordance said what was
 * missing while `APP3-A03` was unbuilt; now that the editor route exists it is a
 * real link, and the sentence explaining its absence is gone rather than left
 * behind to contradict it.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-wave2.json`, under `designTemplates`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const designTemplatesMessage = messageView(VI_MESSAGES.adminWave2, 'designTemplates');

export const DESIGN_TEMPLATE_COPY = {
  page: {
    title: designTemplatesMessage.text('page.title'),
    subtitleWide: designTemplatesMessage.text('page.subtitleWide'),
    subtitleNarrow: designTemplatesMessage.text('page.subtitleNarrow'),
  },

  actions: {
    create: designTemplatesMessage.text('actions.create'),
    retry: designTemplatesMessage.text('actions.retry'),
    loadMore: designTemplatesMessage.text('actions.loadMore'),
    loadingMore: designTemplatesMessage.text('actions.loadingMore'),
  },

  filters: {
    label: designTemplatesMessage.text('filters.label'),
    statusLabel: designTemplatesMessage.text('filters.statusLabel'),
    statusAll: designTemplatesMessage.text('filters.statusAll'),
    productLabel: designTemplatesMessage.text('filters.productLabel'),
    productAll: designTemplatesMessage.text('filters.productAll'),
    /**
     * Stated on the toolbar because its absence is a contract fact, not an
     * oversight: `APP3-B03` publishes no text search, no sort and no total.
     */
    constraint: designTemplatesMessage.text('filters.constraint'),
    productUnavailable: designTemplatesMessage.text('filters.productUnavailable'),
  },

  status: {
    draft: designTemplatesMessage.text('status.draft'),
    published: designTemplatesMessage.text('status.published'),
    archived: designTemplatesMessage.text('status.archived'),
    unknown: designTemplatesMessage.text('status.unknown'),
  },

  columns: {
    name: designTemplatesMessage.text('columns.name'),
    status: designTemplatesMessage.text('columns.status'),
    scope: designTemplatesMessage.text('columns.scope'),
    version: designTemplatesMessage.text('columns.version'),
    updated: designTemplatesMessage.text('columns.updated'),
    actions: designTemplatesMessage.text('columns.actions'),
  },

  row: {
    /** Truthful for a header `APP3-B03` created and `APP3-B03A` has not saved. */
    noVersion: designTemplatesMessage.text('row.noVersion'),
    /**
     * The list projection passes no version at all, so the cell must not claim
     * one is absent — that would mislabel every published template. It says
     * where the number lives instead.
     */
    versionNotInList: designTemplatesMessage.text('row.versionNotInList'),
    noScope: designTemplatesMessage.text('row.noScope'),
    /**
     * A scope exists but its Product is not among the loaded filter options, so
     * only the fact can be stated — resolving the name would cost a request per
     * row, which is the N+1 the list exists to avoid.
     */
    scopeAssigned: designTemplatesMessage.text('row.scopeAssigned'),
    scopeOnProduct: (product: string) =>
      designTemplatesMessage.text('row.scopeOnProduct', { product }),
    archivedAt: (at: string) => designTemplatesMessage.text('row.archivedAt', { at }),
  },

  editAffordance: {
    /**
     * A real link since `APP3-A03` delivered the editor route. It was a disabled
     * button carrying its own reason until then — the same rule in both states:
     * a control either works or says why it does not, and never leads nowhere.
     */
    label: designTemplatesMessage.text('editAffordance.label'),
  },

  states: {
    loading: designTemplatesMessage.text('states.loading'),
    emptyTitle: designTemplatesMessage.text('states.emptyTitle'),
    emptyBody: designTemplatesMessage.text('states.emptyBody'),
    emptyFilteredTitle: designTemplatesMessage.text('states.emptyFilteredTitle'),
    emptyFilteredBody: designTemplatesMessage.text('states.emptyFilteredBody'),
    errorTitle: designTemplatesMessage.text('states.errorTitle'),
    errorBody: designTemplatesMessage.text('states.errorBody'),
    /** A malformed cursor is a bounded, non-restarting failure. */
    cursorErrorTitle: designTemplatesMessage.text('states.cursorErrorTitle'),
    cursorErrorBody: designTemplatesMessage.text('states.cursorErrorBody'),
    loadMoreFailed: designTemplatesMessage.text('states.loadMoreFailed'),
  },

  create: {
    title: designTemplatesMessage.text('create.title'),
    help: designTemplatesMessage.text('create.help'),
    nameLabel: designTemplatesMessage.text('create.nameLabel'),
    nameHelp: designTemplatesMessage.text('create.nameHelp'),
    descriptionLabel: designTemplatesMessage.text('create.descriptionLabel'),
    descriptionHelp: designTemplatesMessage.text('create.descriptionHelp'),
    /**
     * The slug is server-derived, so it is shown as a consequence and never
     * offered as an input.
     */
    slugNote: designTemplatesMessage.text('create.slugNote'),
    submit: designTemplatesMessage.text('create.submit'),
    submitting: designTemplatesMessage.text('create.submitting'),
    cancel: designTemplatesMessage.text('create.cancel'),
    created: (name: string) => designTemplatesMessage.text('create.created', { name }),
    nameRequired: designTemplatesMessage.text('create.nameRequired'),
    nameTooLong: designTemplatesMessage.text('create.nameTooLong'),
    descriptionTooLong: designTemplatesMessage.text('create.descriptionTooLong'),
    failedTitle: designTemplatesMessage.text('create.failedTitle'),
    failedBody: designTemplatesMessage.text('create.failedBody'),
    /**
     * The create `409` is *"no template address could be reserved"*, not "that
     * name is taken" — the server appends the new Template's own id when a
     * derived slug collides, so two templates may share a name. Asking for a
     * different name would name the wrong cause and suggest a fix that does not
     * apply; a retry gets a new id and therefore a new address.
     */
    addressUnreservedTitle: designTemplatesMessage.text('create.addressUnreservedTitle'),
    addressUnreservedBody: designTemplatesMessage.text('create.addressUnreservedBody'),
  },
} as const;

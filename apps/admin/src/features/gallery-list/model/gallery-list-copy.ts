/**
 * Every operator-facing string on the Admin gallery list (`866:905`,
 * `867:907`, `867:946`).
 *
 * One catalog, so no component hard-codes copy (CLAUDE.md §5) and the screen's
 * vocabulary can be reviewed as a whole. The **status** labels are not here —
 * they belong to the shared `gallery-status.ts`, because an entry must not be named one
 * thing in the filter, another in its row and a third in the editor
 * `APP11-A02` builds from the same three states.
 *
 * ### Only what an operator can act on
 *
 * This catalog carries no endpoint name, no contract field (`hasNext`,
 * `nextCursor`, `display_order`), no checkpoint identifier and no note
 * explaining why the screen is built the way it is. Those are engineering
 * facts: they belong in these comments and in the completion report, where the
 * people they are addressed to will read them, and they are noise to an
 * operator looking for a gallery entry. Every string below is a thing the
 * operator is being told, asked, or offered.
 *
 * The error sentences are chosen by failure *classification* alone. A server
 * `message`, `code`, HTTP status or `requestId` is never rendered.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `galleryList`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const galleryListMessage = messageView(VI_MESSAGES.admin, 'galleryList');

export const GALLERY_LIST_COPY = {
  page: {
    breadcrumb: galleryListMessage.text('page.breadcrumb'),
    title: galleryListMessage.text('page.title'),
    /** The sidenav entry (`866:905`) — the same words as the page title. */
    navLabel: galleryListMessage.text('page.navLabel'),
    /** The table's accessible name. Not drawn, but announced. */
    tableLabel: galleryListMessage.text('page.tableLabel'),
  },
  columns: {
    entry: galleryListMessage.text('columns.entry'),
    displayOrder: galleryListMessage.text('columns.displayOrder'),
    linkedProduct: galleryListMessage.text('columns.linkedProduct'),
    status: galleryListMessage.text('columns.status'),
  },
  entry: {
    /** Prefixes the slug in the row so it reads as an address, not a title. */
    slugPrefix: galleryListMessage.text('entry.slugPrefix'),
    /**
     * The accessible name of a row link.
     *
     * The visible link text is the entry's title, which is the right label in
     * context. Out of context — in a screen reader's list of links — a bare
     * title does not say what following it does, so the name states the action
     * and the subject together.
     */
    openLabel: (title: string) => galleryListMessage.text('entry.openLabel', { title }),
    assetCount: (count: number) => galleryListMessage.text('entry.assetCount', { count }),
  },
  linkedProduct: {
    /**
     * A truthful signal, never the raw id. The list publishes
     * `linkedProductId` and no product label, and resolving one per row would
     * be an N+1 Catalog read this screen has no reason to open. `APP11-A02`
     * owns the actual product selector and label.
     */
    linked: galleryListMessage.text('linkedProduct.linked'),
    unlinked: galleryListMessage.text('linkedProduct.unlinked'),
  },
  cover: {
    /** The neutral tile for an entry with no cover, or a cover that failed. */
    placeholder: galleryListMessage.text('cover.placeholder'),
    failed: galleryListMessage.text('cover.failed'),
    /** Alt text is DERIVED, never persisted: the API publishes no `altText`. */
    alt: (title: string) => galleryListMessage.text('cover.alt', { title }),
  },
  filters: {
    statusLabel: galleryListMessage.text('filters.statusLabel'),
    /** Omits the parameter entirely — never an invented `ALL` token. */
    all: galleryListMessage.text('filters.all'),
    reset: galleryListMessage.text('filters.reset'),
  },
  actions: {
    loadMore: galleryListMessage.text('actions.loadMore'),
    loadingMore: galleryListMessage.text('actions.loadingMore'),
    retry: galleryListMessage.text('actions.retry'),
    signIn: galleryListMessage.text('actions.signIn'),
  },
  states: {
    loading: galleryListMessage.text('states.loading'),
    appended: galleryListMessage.text('states.appended'),
    emptyTitle: galleryListMessage.text('states.emptyTitle'),
    /**
     * The create action now exists beside this text, so the body invites the
     * operator to use it rather than explaining an absence.
     */
    emptyBody: galleryListMessage.text('states.emptyBody'),
    filteredEmptyTitle: galleryListMessage.text('states.filteredEmptyTitle'),
    filteredEmptyActive: (label: string) =>
      galleryListMessage.text('states.filteredEmptyActive', { label }),
    filteredEmptyBody: galleryListMessage.text('states.filteredEmptyBody'),
    errorTitle: galleryListMessage.text('states.errorTitle'),
    errorBody: galleryListMessage.text('states.errorBody'),
    unauthenticatedTitle: galleryListMessage.text('states.unauthenticatedTitle'),
    unauthenticatedBody: galleryListMessage.text('states.unauthenticatedBody'),
    loadMoreFailed: galleryListMessage.text('states.loadMoreFailed'),
    exhausted: galleryListMessage.text('states.exhausted'),
  },
} as const;

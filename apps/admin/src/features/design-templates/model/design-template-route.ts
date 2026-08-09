/**
 * The Admin Design Template URL space, owned in one place.
 *
 * The shell navigation, the list segment, the list's row affordance and the
 * editor segment all read from here, so there is exactly one spelling and no
 * `/admin/design-templates`, `/templates` or `/mau-theu` alias.
 *
 * The **editor** route lives here too, beside the collection it is a child of,
 * rather than in the `design-template-editor` feature. Both are the same URL
 * namespace, and one owner is what keeps the child from drifting off its parent
 * — but the deciding reason is structural: the list links *into* the editor and
 * the editor links *back* to the list, so a route constant in each feature would
 * make the two features import each other. Keeping both here leaves a single
 * direction, `design-template-editor → design-templates`.
 *
 * Neutral module (no `server-only`) — the client navigation imports it.
 */
export const ADMIN_DESIGN_TEMPLATES_ROUTE = '/design-templates';

/**
 * One Template's editor (`APP3-A03`).
 *
 * Addressed by the Template UUID, never by the slug: the slug is the *published*
 * address and a draft may never have been published, so a slug-addressed editor
 * would be unreachable for exactly the Templates it exists to edit.
 */
export function adminDesignTemplateEditorRoute(templateId: string): string {
  return `${ADMIN_DESIGN_TEMPLATES_ROUTE}/${encodeURIComponent(templateId)}`;
}

/**
 * One Template's lifecycle / publication screen (`APP3-A04`).
 *
 * A **separate route** from the editor rather than a mode of it. The two answer
 * different questions — the editor asks *what does this Template contain*, this
 * one asks *where is it in LC-24 and may it go somewhere else* — and folding the
 * lifecycle commands into the editor would put four guarded state transitions
 * behind a screen whose primary job is an unsaved draft. The operator can then
 * reach publication without carrying a dirty document into it, because the
 * editor's navigation guard still stands between the two.
 *
 * Addressed by the same UUID as the editor, for the same reason: the slug is the
 * *published* address, and this is exactly the screen an unpublished Template
 * must be reachable through.
 */
export function adminDesignTemplatePublicationRoute(templateId: string): string {
  return `${adminDesignTemplateEditorRoute(templateId)}/publication`;
}

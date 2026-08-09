// Public surface of the design-templates feature. The route files, the Admin
// shell navigation and the Template editor import from here only; components,
// hooks, services and model stay encapsulated.
export { DesignTemplateListScreen } from './components/design-template-list-screen';
export {
  ADMIN_DESIGN_TEMPLATES_ROUTE,
  adminDesignTemplateEditorRoute,
  adminDesignTemplatePublicationRoute,
} from './model/design-template-route';
export { DESIGN_TEMPLATE_COPY } from './model/design-template-copy';
/**
 * The list-root cache identity, published for `APP3-A04`.
 *
 * A lifecycle transition changes the status the list renders, so A04 must
 * invalidate the same root this feature reads under — not a literal of its own.
 * Two spellings of one cache key is how an invalidation silently stops matching.
 */
export { designTemplateQueryKeys } from './model/design-template-query-keys';

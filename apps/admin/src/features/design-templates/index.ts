// Public surface of the design-templates feature. The route files, the Admin
// shell navigation and the Template editor import from here only; components,
// hooks, services and model stay encapsulated.
export { DesignTemplateListScreen } from './components/design-template-list-screen';
export {
  ADMIN_DESIGN_TEMPLATES_ROUTE,
  adminDesignTemplateEditorRoute,
} from './model/design-template-route';
export { DESIGN_TEMPLATE_COPY } from './model/design-template-copy';

// Public surface of the design-template-editor feature. The route file imports
// from here only; components, hooks, services and model stay encapsulated.
//
// The editor's own route constant is deliberately **not** here: it lives with
// the Template list, which owns the whole `/design-templates` URL space. See
// `design-templates/model/design-template-route.ts` for why one owner is what
// keeps these two features from importing each other.
export { DesignTemplateEditorScreen } from './components/design-template-editor-screen';

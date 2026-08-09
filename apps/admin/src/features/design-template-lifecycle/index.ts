// Public surface of the design-template-lifecycle feature (`APP3-A04`). The
// route file imports from here only; components, hooks, services and model stay
// encapsulated.
//
// The route constant is deliberately **not** here: the whole `/design-templates`
// URL space is owned by the `design-templates` feature, so this screen's address
// lives beside its parent's. See `design-templates/model/design-template-route.ts`.
export { DesignTemplatePublicationScreen } from './components/design-template-publication-screen';

// Public surface of the design-template-editor feature. The route file imports
// from here only; components, hooks, services and model stay encapsulated.
//
// The editor's own route constant is deliberately **not** here: it lives with
// the Template list, which owns the whole `/design-templates` URL space. See
// `design-templates/model/design-template-route.ts` for why one owner is what
// keeps these two features from importing each other.
export { DesignTemplateEditorScreen } from './components/design-template-editor-screen';
/**
 * The Template detail cache identity, published for `APP3-A04`.
 *
 * The lifecycle screen reads and writes the **same** detail entry this editor
 * does: a publish performed on one screen must be what the other sees, and the
 * `expectedCurrentVersion` both send is that entry's version. A second key
 * spelling would give the two screens two private truths about one Template,
 * which is the exact state the concurrency token exists to prevent.
 */
export { designTemplateEditorKeys } from './model/design-template-editor-keys';

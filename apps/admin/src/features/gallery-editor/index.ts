// Public surface of the gallery-editor feature (`APP11-A02`). The route file
// and the gallery list import from here only; components, hooks, services and
// model stay encapsulated.
//
// Two exports, and they are the two things outside this feature legitimately
// need: the editor screen behind `/gallery/[entryId]`, and the create action
// the list header and empty state render.
//
// The dependency between the two gallery features points one way. This feature
// knows the list's route helper and its cache root; the list knows nothing
// about the editor and receives the create action as an opaque node from the
// route file. A barrel here that the list imported would close that loop into a
// cycle for no gain.
export { GalleryEditorScreen } from './components/gallery-editor-screen';
export { GalleryCreateAction } from './components/gallery-create-action';

// Public surface of the request-design-case feature (`APP6-A02`). The route
// file imports from here only; components, hooks, services and model stay
// encapsulated.
//
// One screen and one route builder, on `APP5-A02`'s and `APP6-A01`'s reasoning.
// The authoring and send services are deliberately not on this boundary:
// appending a design version and sending one to a customer are the two writes
// this screen owns, and anything that could reach them from outside the feature
// would be a state change with no approved control behind it. They are reached
// through the screen or not at all.
//
// The in-memory authoring hook is not exported either. A working Design Document
// is a customer's artwork held in browser memory under this screen's lifetime;
// a second holder of it outside the feature would be a second place it could
// outlive what renders it.
export { DesignCaseWorkbenchScreen } from './components/design-case-workbench-screen';
export { ADMIN_REQUEST_DESIGN_ROUTE } from './model/request-design-case-route';

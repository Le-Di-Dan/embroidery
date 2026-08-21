// Public surface of the request-quotation feature (`APP6-A01`). The route file
// imports from here only; components, hooks, services and model stay
// encapsulated.
//
// One export, on `APP5-A02`'s reasoning. The drafting and send services are
// deliberately not on this boundary: creating a quotation, appending a version
// and sending one to a customer are the three writes this screen owns, and
// anything that could reach them from outside the feature would be a state
// change with no approved control behind it. They are reached through the screen
// or not at all.
export { QuotationWorkbenchScreen } from './components/quotation-workbench-screen';
export { ADMIN_REQUEST_QUOTATION_ROUTE } from './model/request-quotation-route';

// Public surface of the order-detail feature (`APP7-A01`). The route file
// imports from here only; components, hooks, services and model stay
// encapsulated.
//
// One export. The two payment decision services are deliberately not on this
// boundary: a verification is the only operation in APP7 that can move money
// state, and a review writes an immutable reconciliation row. Anything that
// could reach either from outside this feature would be a financial state change
// with no approved control behind it. They are reached through the screen or not
// at all.
export { OrderDetailScreen } from './components/order-detail-screen';

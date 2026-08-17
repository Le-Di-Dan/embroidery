// Public surface of the custom-request-detail feature (`APP5-A02`). The route
// file imports from here only; components, hooks, services and model stay
// encapsulated.
//
// One export. The moderation services are deliberately not on this boundary: a
// transition and a note append are the two writes in APP5's Admin surface, and
// anything that could reach them from outside this feature would be a state
// change with no approved control behind it. They are reached through the screen
// or not at all.
export { CustomRequestDetailScreen } from './components/custom-request-detail-screen';

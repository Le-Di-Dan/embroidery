// Public surface of the production-job feature (`APP8-A03`). The route file
// imports the screen from here; components, hooks, services and model stay
// encapsulated.
//
// The transition service is deliberately **not** on this boundary. It is the
// operation that consumes Catalog stock, moves the order through LC-14 and
// releases holds, it carries no idempotency key, and anything that could reach
// it from outside this feature would be a lifecycle command with no approved
// control behind it. It is reached through a confirmation dialog or not at all.
//
// The detail route address stays in `production-queue`, which owns
// `adminProductionJobRoute` and links to it — one spelling of the path, in the
// capability that already published it.
export { ProductionJobScreen } from './components/production-job-screen';

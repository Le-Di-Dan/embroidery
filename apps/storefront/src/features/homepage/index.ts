// Public surface of the homepage feature. The `/` route segment imports from
// here only; components, model and services stay encapsulated behind it.
//
// `services/homepage-catalog.server` is deliberately NOT re-exported: it reads
// the server-only `INTERNAL_API_BASE_URL`, and routing it through this barrel
// would put that module on a path the bundler can follow into the browser. The
// screen deep-imports it, exactly as `/kham-pha` does with its own server read.
export { HomepageScreen } from './components/homepage-screen';
export { HOMEPAGE_COPY } from './model/homepage-copy';

/**
 * Public surface of the design-studio feature (`APP3-S01`).
 *
 * The route imports from here only; hooks, services and the selection reducer
 * stay encapsulated. The copy is exported because the route segment renders the
 * page heading from it, so the Studio's vocabulary lives in exactly one file.
 */
export { StudioBootstrapIsland } from './bootstrap/studio-bootstrap-island';
export { STUDIO_COPY } from './model/studio-copy';

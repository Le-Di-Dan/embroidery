/**
 * Public surface of the design-studio feature (`APP3-S01`).
 *
 * The route imports from here only; hooks, services and the selection reducer
 * stay encapsulated. The copy is exported because the route segment renders the
 * page heading from it, so the Studio's vocabulary lives in exactly one file.
 */
export { StudioBootstrapIsland } from './bootstrap/studio-bootstrap-island';
export { STUDIO_COPY } from './model/studio-copy';

/**
 * The Session resume handle, read-only, released for `APP5-S01`.
 *
 * A catalog custom request must name the Design Session it was drawn in, and
 * the id of that Session is exactly what this feature already stores under a
 * placement-scoped key. Exporting the **reader** — not the writer, not the
 * clearer — is what keeps Session ownership here: `APP5-S01` can find out which
 * Session belongs to a placement and can name it in a submission, and it can do
 * nothing else to it. The id authorizes nothing on its own; the `HttpOnly`
 * secret that does is unreadable to both features alike.
 */
export { readResumeHandle, type StudioResumeScope } from './model/studio-resume-handle';

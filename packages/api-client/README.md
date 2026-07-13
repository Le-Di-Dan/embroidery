# @embroidery/api-client

Centralized Axios foundation for internal business API calls (D-035).

## Current content

- `createBrowserApiClient` / `createServerApiClient` — the only approved ways
  to obtain an HTTP client for the internal API. Timeouts are named constants.
  Browser clients use the same-origin gateway path from
  `NEXT_PUBLIC_API_BASE_PATH` (e.g. `/api`); server clients require the
  absolute internal URL from the server-only `INTERNAL_API_BASE_URL`
  (e.g. `http://api:4000/api`). See D-036.
- `normalizeApiClientError` — converts any thrown error into the stable
  `NormalizedApiError` shape, unwrapping the standard API envelope from
  `@embroidery/contracts` when present.

## Boundary

- No `fetch` for internal APIs. No business logic in interceptors.
- Feature services (inside each app) wrap these clients; components and pages
  never call Axios directly.
- No automatic retries for mutations.
- Consumed as TypeScript source (just-in-time package, no build step);
  Next.js apps list it in `transpilePackages`.

# @embroidery/api-client

Centralized Axios foundation for internal business API calls (D-035).

## Current content

- `createBrowserApiClient` / `createServerApiClient` — the only approved ways
  to obtain an HTTP client for the internal API. Base URL comes from
  environment configuration; timeouts are named constants.
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

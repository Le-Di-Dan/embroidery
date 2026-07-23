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

## Generated client (Orval, IMP-D023)

- `src/generated/` is **Orval-owned** (`axios-functions` mode). It is generated
  from the committed artifact `packages/contracts/openapi/openapi.generated.json`
  and is **never hand-edited** — types plus thin per-operation functions, no
  TanStack Query/React hooks.
- Every generated operation routes through the handwritten `apiRequest` mutator
  (`src/clients/api-request.mutator.ts`), which forwards to a caller-supplied
  Axios instance. The generated layer owns no Axios singleton, base URL or
  secret, and never injects an `X-Request-ID`.
- Feature services obtain an instance from `createBrowserApiClient` /
  `createServerApiClient` and pass it per call:
  `await healthCheck({ instance })`.

### Commands

- `pnpm --filter @embroidery/api-client generate` — regenerate `src/generated`
  from the artifact and format it. Run after any OpenAPI change.
- `pnpm --filter @embroidery/api-client check:generated` — non-mutating drift
  gate: regenerates into an OS temp mirror and compares deterministic tree
  hashes. Wired into root `quality` (as `check:api-client`) after
  `check:openapi`.

## Boundary

- No `fetch` for internal APIs. No business logic in interceptors or generated
  code.
- Feature services (inside each app) wrap these clients; components and pages
  never call Axios directly. TanStack Query hooks stay handwritten at feature
  level (IMP-D009).
- No automatic retries for mutations.
- Consumed as TypeScript source (just-in-time package, no build step);
  Next.js apps list it in `transpilePackages`.

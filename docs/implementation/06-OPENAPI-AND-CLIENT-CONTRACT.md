# OpenAPI and Frontend Client Contract

## 1. Contract approach

Use a hybrid process:

1. A small contract checkpoint defines endpoint semantics before implementation.
2. NestJS code and Swagger decorators become the executable source.
3. The generated OpenAPI document is the machine-readable contract.
4. A generated TypeScript/Axios client consumes that document.
5. TanStack Query hooks remain handwritten at feature level.

This avoids maintaining a permanent duplicate handwritten OpenAPI YAML while preserving human review before coding.

## 2. Contract checkpoint contents

For each endpoint slice define:

- Operation ID.
- Method/path.
- Actor/authorization.
- Request fields.
- Response fields and envelope.
- Error codes.
- Pagination/filter/sort.
- Idempotency.
- State/concurrency conflict behavior.
- Audit behavior.
- Examples using synthetic data.

A contract checkpoint may cover at most the same five tightly related endpoint limit as implementation.

## 3. Generated artifacts

Recommended ownership:

```text
packages/contracts/
├── openapi/
│   └── openapi.generated.json
└── README.md

packages/api-client/
├── src/generated/
├── src/axios-instance.ts
├── src/errors/
└── README.md
```

Generated files:

- Are never edited manually.
- Are reproducible from repository commands.
- Are reviewed through contract diff.
- Must not contain environment-specific URLs or secrets.

### 3.1 Codegen tool (locked — IMP-D023)

- **Tool:** Orval (npm `orval`, pinned `8.22.0`, MIT), `axios-functions` mode with a `mutator`.
- **Input:** the committed offline artifact `packages/contracts/openapi/openapi.generated.json` only — never a live Swagger URL.
- **Output:** `packages/api-client/src/generated/` — generated **types + thin per-operation Axios functions only**; no TanStack Query/SWR/React hooks are generated (hooks stay handwritten, §6).
- **Runtime ownership:** the `mutator` routes every generated call through the existing handwritten Axios instance (`packages/api-client/src/clients`/`config`/`errors`), which keeps sole ownership of base URL, interceptors, retry policy and envelope error-normalization. The generated layer holds no base URL, secret, or instance of its own.
- **Boundary:**

  ```text
  packages/api-client/
  ├── src/generated/   # Orval-owned; never hand-edit
  ├── src/clients/     # handwritten Axios instance + factories
  ├── src/config/      # base-URL/timeout config
  ├── src/errors/      # envelope error normalization
  └── src/index.ts     # controlled exports
  ```

- **Rejected:** OpenAPI Generator `typescript-axios` (Java/JAR runtime — supply-chain/toolchain cost in a Node/pnpm monorepo); Hey API `@hey-api/openapi-ts` (vendors a competing runtime client into the generated tree that fails the repo-locked `exactOptionalPropertyTypes` strict flag).
- **Version policy:** exact pin; no automatic major upgrade; on any upgrade re-review the generated diff and re-run strict compile + determinism + `quality`.
- **Drift check:** a non-mutating gate — generate into a temp directory, apply the same formatter, compare the tracked generated tree, fail with the regenerate command, clean up in `finally`, integrate into root `quality` — delivered by APP0-C02.

## 4. Stable operation IDs

Operation IDs are public internal contracts. Renaming one can break the generated client even when method/path remains unchanged.

- Use domain/use-case names.
- Do not include implementation class names.
- Do not reuse an operation ID.
- Breaking changes require explicit impact analysis.

## 5. Axios policy

- Axios is the only application API HTTP client.
- One configured instance handles base URL, request ID/correlation where applicable, auth/session behavior, envelope/error normalization, and safe retries.
- Feature components do not instantiate Axios.
- Retry is not automatic for non-idempotent operations without an explicit policy.

## 6. TanStack Query policy

Generate types and Axios operations, but write TanStack Query hooks manually.

Reasons:

- Cache keys and invalidation are business behavior.
- Optimistic updates require domain-specific conflict handling.
- Server prefetch/hydration choices differ by route.
- Manual hooks are easier to review than opaque generated cache behavior.

## 7. Contract compatibility

Classify changes:

- Non-breaking: additive optional response field, new endpoint, expanded enum only when clients safely tolerate it.
- Potentially breaking: required field, changed error code, changed pagination, operation ID rename.
- Breaking: removed/renamed field, changed type, changed route/method, changed authorization semantics.

Breaking changes require a dedicated contract migration checkpoint and affected frontend plan.

## 8. CI gates

CI should verify:

- Swagger generation succeeds.
- Operation IDs are unique.
- OpenAPI schema is valid.
- Generated client is up to date.
- No manual changes exist inside generated directories.
- Contract diff is reported.
- API integration tests agree with documented responses.

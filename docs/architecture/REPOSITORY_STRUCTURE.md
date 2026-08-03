# Repository Structure

**Status:** Approved technical baseline  
**Version:** 0.2.0

## 1. Repository model

The project is a pnpm-workspace monorepo orchestrated by Turborepo.

The structure is:

- Deployable applications under `apps/`.
- Reusable, intentionally shared code under `packages/`.
- Product and technical documentation under `docs/`.
- Deployment and operations assets under `infrastructure/`.
- Repository-only tooling under `tools/`.
- Research-only feasibility spikes under `spikes/` (never a production dependency).

## 2. Top-level structure

```text
embroidery-commerce/
├── apps/
│   ├── storefront/
│   ├── admin/
│   ├── api/
│   └── worker/
├── packages/
│   ├── contracts/
│   ├── api-client/
│   ├── design-document/
│   ├── design-engine/
│   ├── domain-types/
│   ├── ui/
│   ├── validation/
│   ├── observability/
│   ├── test-utils/
│   ├── eslint-config/
│   ├── prettier-config/
│   └── typescript-config/
├── docs/
│   ├── architecture/
│   ├── development/
│   ├── adr/
│   └── operations/
├── infrastructure/
│   ├── compose/
│   ├── docker/
│   ├── kubernetes/
│   ├── monitoring/
│   ├── backup/
│   └── scripts/
├── spikes/
├── tools/
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

Packages are created only when real cross-application reuse exists. Do not promote feature-local code into `packages/` for hypothetical reuse.

## 3. Placement rule

Always place code at the narrowest valid scope:

```text
Component-local
→ Feature/module-local
→ Application shared
→ Workspace package
```

Examples:

- Constant used only by one component: component folder.
- Hook used only by catalog: catalog feature.
- Utility shared by several storefront features: storefront `shared/`.
- Contract used by storefront, admin, and API: workspace package.
- Business rule owned by quotation: backend quotation module, not a generic package.

## 4. Frontend application structure

```text
apps/storefront/src/
├── app/
├── features/
├── shared/
├── config/
└── styles/
```

The Admin application follows the same high-level structure.

### `app/`

Contains only:

- Routes.
- Layouts.
- Metadata.
- Loading/error/not-found boundaries.
- Server-side page composition.
- Route-specific providers when necessary.

Do not place feature implementation or business rules in `app/`.

### `features/`

Contains business-facing frontend capabilities, such as:

```text
features/
├── catalog/
├── product-detail/
├── gallery/
├── design-studio/
├── customer-request/
├── quotation/
├── design-approval/
├── checkout/
└── payment/
```

Each feature is internally grouped by responsibility.

### `shared/`

Contains application-wide technical or presentation code genuinely used by multiple features:

```text
shared/
├── components/
├── hooks/
├── services/
├── schemas/
├── constants/
├── utils/
└── types/
```

Business-specific code does not belong in `shared/`.

## 5. Frontend feature structure

A normal feature may use:

```text
features/catalog/
├── components/
├── hooks/
├── services/
├── api/
├── stores/
├── schemas/
├── constants/
├── utils/
├── mappers/
├── types/
├── tests/
└── index.ts
```

Create only directories that are needed. Do not scaffold empty folders.

A component with meaningful subparts gets its own directory:

```text
components/product-card/
├── product-card.tsx
├── product-card-image.tsx
├── product-card-price.tsx
├── product-card-actions.tsx
├── product-card.types.ts
├── product-card.constants.ts
├── product-card.test.tsx
└── index.ts
```

Each `.tsx` production file contains one React component.

## 6. Large frontend feature structure

Large capabilities are split into sub-capabilities rather than flattened:

```text
features/design-studio/
├── components/
│   ├── canvas/
│   ├── toolbar/
│   ├── layer-panel/
│   ├── property-panel/
│   └── preview/
├── hooks/
├── stores/
├── services/
├── commands/
├── geometry/
│   ├── bounds/
│   ├── transforms/
│   ├── snapping/
│   ├── alignment/
│   └── measurement/
├── schemas/
├── constants/
├── utils/
├── types/
├── tests/
└── index.ts
```

Do not place dozens of files at one feature root and distinguish them only through suffixes.

## 7. Backend application structure

```text
apps/api/src/
├── modules/
├── shared/
├── config/
├── bootstrap/
└── main.ts
```

Business modules include:

```text
modules/
├── identity/
├── customer/
├── catalog/
├── inventory/
├── asset/
├── design/
├── quotation/
├── order/
├── payment/
├── production/
├── gallery/
├── notification/
└── audit/
```

## 8. Backend module structure

A module is divided by architectural responsibility:

```text
modules/quotation/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── services/
│   ├── repositories/
│   ├── events/
│   ├── errors/
│   ├── constants/
│   └── types/
├── application/
│   ├── commands/
│   ├── queries/
│   ├── dto/
│   ├── ports/
│   ├── services/
│   ├── mappers/
│   ├── constants/
│   └── types/
├── infrastructure/
│   ├── persistence/
│   ├── messaging/
│   ├── cache/
│   ├── external-services/
│   └── config/
├── presentation/
│   ├── http/
│   └── events/
├── tests/
│   ├── integration/
│   ├── contract/
│   └── fixtures/
├── quotation.module.ts
└── index.ts
```

Not every module needs every directory. Create a directory only when its responsibility exists.

## 9. Use-case directory structure

Commands and queries use one directory per use case:

```text
application/commands/create-quotation/
├── create-quotation.command.ts
├── create-quotation.handler.ts
├── create-quotation.validator.ts
└── create-quotation.handler.spec.ts
```

This is preferred over placing every command and handler at one level.

## 10. Worker structure

```text
apps/worker/src/
├── jobs/
│   ├── mockup-rendering/
│   ├── watermark-rendering/
│   ├── asset-processing/
│   ├── notification-delivery/
│   ├── session-cleanup/
│   └── payment-reconciliation/
├── shared/
├── config/
├── bootstrap/
└── main.ts
```

Each job capability follows responsibility-based subfolders where needed.

Worker jobs invoke application-owned contracts. They must not duplicate domain rules from the API.

## 11. Package boundaries

### `packages/contracts`

Cross-application transport contracts and schemas.

### `packages/api-client`

Client boundary for the business API. Two layers coexist:

- `src/generated/` — **tool-owned**, produced by Orval from `packages/contracts/openapi/openapi.generated.json` (IMP-D023). Types plus thin per-operation Axios functions; never hand-edited; no TanStack Query/React hooks.
- `src/clients` · `src/config` · `src/errors` — **handwritten runtime**: the single Axios instance (base-URL/timeout/interceptor ownership), `NormalizedApiError` envelope normalization. Generated functions route through this instance via an Orval `mutator`; feature layers wrap the client and never call Axios directly.

Codegen tool and generated-vs-handwritten boundary are locked (IMP-D023); the reproducible export, generation command and non-mutating drift check are delivered by APP0-C02.

### `packages/design-document`

Framework-independent design-document types, validation, serialization, and migrations.

Canonical serialization and hashing are locked by ADR-DB1-012; the renderer is a
consumer of this package and never a second source of truth (IMP-D026).

### `packages/design-engine`

Framework-independent geometry and transformation logic, including the
document-pixel ↔ product-image-pixel ↔ physical-millimetre conversions the Studio
must not re-implement per feature (IMP-D026).

### `packages/domain-types`

Only stable, cross-application domain primitives. Do not move backend entities here.

### `packages/ui`

Components genuinely shared between storefront and admin. Feature-specific components remain inside applications.

### `packages/database`

Database foundation: Drizzle schema (per-context schema folders), client, config, errors, migrations, primitives, and DB CLI. Owns physical schema and derived status/enum types. Not a business-logic host.

### `packages/persistence`

Shared persistence/DI foundation and the **Platform (CTX-PLT) infrastructure area**: outbox event store, idempotency store, background-job-attempt/dead-letter store, policy-configuration repository, the Nest database module, and database health. Infrastructure-only, no domain rules; must not become a service locator (ADR-DB1-009). Consumed by `apps/api` and `apps/worker`.

### `packages/validation`

Shared validation primitives/utilities. No business rules or domain ownership.

### `packages/observability`

Structured logging, correlation, and telemetry foundation (currently a stub; filled by APP0-B05). No domain ownership.

### `packages/test-utils`

Package-neutral integration-test helpers (APP0-T01). Holds only shared teardown orchestration (`CleanupStack`) — no database lifecycle (owned by `@embroidery/database/testing`), no Nest bootstrap, no business rules, no credentials, **and no React/DOM**. Application-level integration contexts (e.g. the API's `AppModule` + Supertest adapter) live in the consuming app's test-support directory, not here, so ownership is not reversed. No production ownership.

### `packages/frontend-testing`

React-aware shared component-test support (`@embroidery/frontend-testing`), locked by `APP0-DEC-COMPONENT-TEST` (IMP-D024) and implemented by APP0-T02A. Owns the shared render helper (`renderWithProviders`), the deterministic `QueryClient` factory, the `next/navigation` mock factory, and the shared user-event helper used by both frontend apps under the Jest + `next/jest` + `jsdom` + React Testing Library stack. Kept separate from `@embroidery/test-utils` so that package stays backend-neutral. Because it imports no Next assets it does not (and cannot) use `next/jest`; its own unit tests use ts-jest + jsdom — the locked `next/jest` transform still governs the apps' component tests. No production runtime ownership; it is a devDependency only.

### `packages/e2e-testing`

Cross-application browser end-to-end suite (`@embroidery/e2e-testing`), locked by `APP0-DEC-E2E` (IMP-D025) and implemented by APP0-T02B. Owns `playwright.config.ts`, the E2E `specs/**`, and `support/**` (fixtures, the single app/gateway/API/disposable-Postgres orchestrator, and the disposable-DB adapter that **reuses** `@embroidery/database/testing` + `@embroidery/test-utils` `CleanupStack` rather than duplicating database lifecycle). Runs the **Playwright Test** tier (separate from Jest, which stays the sole unit/component runner). It sits under `packages/` — not `apps/` — because it is shared cross-app test tooling, not a deployable application, and never lives under any app `src/`. `@playwright/test` and browser binaries are devDependencies of this package only; E2E is excluded from the browser-free scoped validation a change ordinarily runs and has its own CI tier; its commands are owned by this package and invoked with `pnpm --filter @embroidery/e2e-testing …` (`docs/implementation/SCOPED_COMMAND_INDEX.md`). No production runtime ownership.

**Frontend test placement (APP0-T02A, stricter than colocation).** Frontend tests and test-support live under `apps/<app>/test/**` — never under `apps/<app>/src/**`, which stays production-only:

- `apps/<app>/test/smoke/**` — route-handler / server-only tests (Node environment via a `@jest-environment node` docblock);
- `apps/<app>/test/components/**` — jsdom component/interaction tests;
- `apps/<app>/test/fixtures/**` — small, explicitly test-only components;
- `apps/<app>/test/support/**` — app-specific test support (if any).

Each app owns its `jest.config.mjs` (`next/jest`, default `jsdom`, `roots: ['<rootDir>/test']`) and app-root `jest.setup.ts`. The production `next build` (`.next`) contains no test code, enforced by `tools/check-frontend-test-boundaries.mjs` (static) and `tools/check-frontend-build-boundary.mjs` (post-build).

### Configuration packages

Centralized ESLint, Prettier, and TypeScript configurations.

## 11a. Backend module list reconciliation (APP0-C01)

The §7 module list is an "include" list, not exhaustive. The repository currently contains 14 business Nest modules plus `health`: `identity`, `customer`, `catalog`, `inventory`, `asset`, `design`, `order` (hosts Custom Request **and** Order), `quotation`, `payment`, `production`, `gallery`, `content`, `notification`, `audit`. The Platform (CTX-PLT) area is not a business module and lives in `packages/persistence/src/platform/` (see §11), consumed by the API and worker — it is not under `apps/api/src/shared/`.

Current transitional state (documentation-only observations from APP0-C01; no code change):

- Modules currently contain `domain/` + `infrastructure/` only; `application/` and `presentation/http` layers and feature controllers arrive in later APP phases (only `health` has a controller today).
- No module exposes an `index.ts` public barrel yet; cross-module ports are reached by deep path into `<module>/domain/repositories/*.port.ts`. Module public barrels (or path aliases) are a future refinement; the logical boundary (port-only, no concrete-repository import) already holds.
- Branded cross-module ID types (`SkuId`, `ProductVariantId`) are currently exported from `catalog/domain/repositories/placement-hierarchy.port`; `DB2_PACKAGE_MODULE_MAPPING §2` anticipates such primitives living in `packages/domain-types`. Reconciling their home is a future backend refinement, not an APP0-C01 code change.

The canonical logical ownership map (contexts → modules → aggregate/repository/API/worker ownership, dependency direction, no-cycle rule) is owned by [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) §8; this document owns physical placement and package ownership only.

## 11b. `spikes/` — research-only workspaces

`spikes/*` holds bounded technical feasibility work whose product is *evidence
and a decision*, not shipped code. A spike:

- is a private workspace member (`spikes/*` in `pnpm-workspace.yaml`) so its
  dependencies are resolved and locked normally;
- must never appear in the `dependencies`/`devDependencies` of any `apps/*` or
  `packages/*` manifest, and must never be imported by application source;
- must not add a candidate dependency to a production manifest — adopting a
  selected technology is the owning phase's checkpoint, not the spike's;
- keeps its heavy work (benchmarks, browser runs) out of the browser-free scoped
  validation a change ordinarily runs; only its static isolation gate
  (`node tools/check-spike-boundaries.mjs`) belongs there;
- commits small machine-readable results as evidence, with no absolute machine
  path, secret or external URL.

`node tools/check-spike-boundaries.mjs` enforces the static rules and, with
`--build`, asserts the produced `.next`/`dist` output carries no spike or
candidate marker. Current spikes: `spikes/app0-r01-design-studio/` (APP0-R01,
2D rendering feasibility → IMP-D026).

## 12. Import rules

### Frontend

- A feature may import its own internals.
- A feature may import application shared code.
- A feature may import approved workspace packages.
- A feature must not import another feature's private path.
- Cross-feature access uses the feature's public `index.ts` only when explicit coupling is accepted.

### Backend

- A module must not import another module's ORM entities.
- A module must not instantiate another module's concrete repository.
- Cross-module collaboration uses a public application service, port, query contract, or event.
- Infrastructure code cannot be imported into domain code.
- Presentation code cannot own business decisions.

## 13. Barrel files

Use `index.ts` only at intentional public boundaries:

- Feature root.
- Module root.
- Major component directory.
- Workspace package root.

Do not create barrels in every folder. Do not import a feature's own internals through its public barrel when doing so creates circular dependencies.

## 14. Naming

- Directories and files: kebab-case.
- React components and TypeScript types: PascalCase.
- Functions and variables: camelCase.
- Constants: UPPER_SNAKE_CASE for scalar constants; named readonly objects may use camelCase when appropriate.
- Tests: `.spec.ts`, `.test.ts`, or repository-standard suffix selected later.
- No generic filenames such as `helpers.ts`, `common.ts`, `misc.ts`, or `shared.ts`.

## 15. File-size enforcement

- Logic/source hard limit: 400 lines.
- Test hard limit: 600 lines.
- Review threshold: 300 source lines and 500 test lines.
- Generated outputs and explicitly configured pure-data files may be excluded.
- A file over the review threshold must be examined for separation of responsibilities.
- Splitting must preserve cohesion; arbitrary line-based splitting is prohibited.

## 16. Dependency governance

- Workspace dependencies are declared explicitly.
- Circular dependencies are prohibited.
- Feature or module boundary rules must be enforceable through ESLint or repository tooling.
- A new workspace package requires a clear owner, purpose, and consumer list.
- Deep imports into another package's private directories are prohibited.

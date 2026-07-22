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

Generated or maintained client boundary for the business API. The generation strategy is an open decision.

### `packages/design-document`

Framework-independent design-document types, validation, serialization, and migrations.

### `packages/design-engine`

Framework-independent geometry and transformation logic.

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

Shared testing utilities/harness support (currently a stub; the canonical database test harness is reused/adapted by APP0-T01). No production ownership.

### Configuration packages

Centralized ESLint, Prettier, and TypeScript configurations.

## 11a. Backend module list reconciliation (APP0-C01)

The §7 module list is an "include" list, not exhaustive. The repository currently contains 14 business Nest modules plus `health`: `identity`, `customer`, `catalog`, `inventory`, `asset`, `design`, `order` (hosts Custom Request **and** Order), `quotation`, `payment`, `production`, `gallery`, `content`, `notification`, `audit`. The Platform (CTX-PLT) area is not a business module and lives in `packages/persistence/src/platform/` (see §11), consumed by the API and worker — it is not under `apps/api/src/shared/`.

Current transitional state (documentation-only observations from APP0-C01; no code change):

- Modules currently contain `domain/` + `infrastructure/` only; `application/` and `presentation/http` layers and feature controllers arrive in later APP phases (only `health` has a controller today).
- No module exposes an `index.ts` public barrel yet; cross-module ports are reached by deep path into `<module>/domain/repositories/*.port.ts`. Module public barrels (or path aliases) are a future refinement; the logical boundary (port-only, no concrete-repository import) already holds.
- Branded cross-module ID types (`SkuId`, `ProductVariantId`) are currently exported from `catalog/domain/repositories/placement-hierarchy.port`; `DB2_PACKAGE_MODULE_MAPPING §2` anticipates such primitives living in `packages/domain-types`. Reconciling their home is a future backend refinement, not an APP0-C01 code change.

The canonical logical ownership map (contexts → modules → aggregate/repository/API/worker ownership, dependency direction, no-cycle rule) is owned by [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) §8; this document owns physical placement and package ownership only.

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

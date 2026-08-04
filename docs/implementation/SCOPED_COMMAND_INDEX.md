# Scoped Command Index

Canonical discovery index for every command that used to be a root
`package.json` alias. Locked by `GOV-Q01-C1` (2026-08-04).

Root `package.json` is **not** a command registry. It carries only
repository-global orchestration, the global quality controls and shared
infrastructure/database lifecycle — 30 scripts. Everything else lives with its
owner and is invoked directly. This file is how you find it.

## 1. How to read this

| Field | Meaning |
|---|---|
| **Command ID** | Stable semantic id. Cite it in checkpoint prompts and reports. |
| **Former root alias** | The `package.json` key removed by `GOV-Q01-C1`. Never re-add it. |
| **Owner** | The workspace, tool file, historical checkpoint or release activity that owns the command. |
| **Direct invocation** | Exactly what to run. |
| **Usage scope** | The impact reason that justifies running it. |
| **Status** | `ACTIVE_SCOPED`, `HISTORICAL_SCOPED`, `RETIRED_AGGREGATE` or `BROKEN_LEGACY_REFERENCE`. |

Statuses:

- **`ACTIVE_SCOPED`** — current, run when its usage scope is met.
- **`HISTORICAL_SCOPED`** — owned by a delivered checkpoint. Still runnable and
  still authoritative over its own inputs, but run **only** when the current
  change touches those inputs, and say why in the report.
- **`RETIRED_AGGREGATE`** — a command that combined unrelated work. It is
  **not** a recommended entry point. Its owner commands are listed instead. It
  may be reconstructed only by an explicitly authorized release/regression plan
  (`VALIDATION_GOVERNANCE.md` §7).
- **`BROKEN_LEGACY_REFERENCE`** — the former alias pointed at a target that does
  not exist. None at the time of writing.

**This index is documentation.** There is no command runner, dispatcher, JSON
registry, generated script or CLI behind it, and none may be added. Do not add a
root script merely to make a command discoverable — add or update a row here.

## 2. Root `package.json` — what stays

Exactly 30 scripts, in three groups. A `sonar` script may be added only when
`FU-GOV-Q01-SONAR-COMMAND-01` produces a portable, token-safe invocation.

| Group | Scripts |
|---|---|
| Repository-wide orchestration | `dev`, `build`, `clean` |
| Global quality controls | `format`, `format:check`, `lint` (SonarQube: see `VALIDATION_GOVERNANCE.md` §6) |
| Shared Docker/infrastructure lifecycle | `docker:dev:config`, `docker:dev:build`, `docker:dev:up`, `docker:dev:ps`, `docker:dev:logs`, `docker:dev:down`, `docker:debug:up`, `docker:debug:down`, `docker:quality:up`, `docker:quality:down`, `docker:clean:volumes` |
| Shared database lifecycle and operations | `db:up`, `db:down`, `db:logs`, `db:generate`, `db:generate:custom`, `db:migrate`, `db:status`, `db:reset`, `db:backup`, `db:restore`, `db:pitr:rehearse`, `db:retention`, `db:anonymize` |

`docker:quality:up` / `docker:quality:down` stay because they manage shared
**SonarQube infrastructure**, not a validation alias.

## 3. Index — 71 removed aliases

| Command ID | Former root alias | Owner | Category | Direct invocation | Source / target | Usage scope | Status |
|---|---|---|---|---|---|---|---|
| `CMD-TYPECHECK-ALL` | `typecheck` | release/regression activity | aggregate | `pnpm --filter <workspace> typecheck` | `turbo run typecheck` across 21 workspaces | Only under an authorized release/regression plan; otherwise typecheck the workspace you changed. | `RETIRED_AGGREGATE` |
| `CMD-TEST-ALL` | `test` | release/regression activity | aggregate | `pnpm --filter <workspace> test · node --test "tools/*.test.mjs"` | `turbo run test` across 21 workspaces plus the tools suite | Only under an authorized release/regression plan. Its two halves are separate owners and must be run as such. | `RETIRED_AGGREGATE` |
| `CMD-TEST-COVERAGE-ALL` | `test:coverage` | release/regression activity | aggregate | `pnpm --filter <workspace> test:coverage` | `turbo run test:coverage` across 21 workspaces | Produces the lcov inputs `sonar-project.properties` names; run under a Sonar or release activity. | `RETIRED_AGGREGATE` |
| `CMD-QUALITY-E2E` | `quality:e2e` | release/regression activity | aggregate | `pnpm --filter @embroidery/e2e-testing check:e2e · pnpm --filter @embroidery/e2e-testing e2e:full` | `check:e2e` + the full Playwright matrix | The browser tier. Only under an authorized release/regression plan; never a default acceptance criterion. | `RETIRED_AGGREGATE` |
| `CMD-TEST-OBJECT-STORAGE-CONTRACT` | `test:object-storage:contract` | `@embroidery/object-storage` | contract test | `pnpm --filter @embroidery/object-storage test:contract` | object-storage adapter contract suite | Any change to the object-storage abstraction or an adapter. | `ACTIVE_SCOPED` |
| `CMD-TEST-ASSET-INTAKE-INTEGRATION` | `test:asset-intake:integration` | `@embroidery/api` | integration test | `pnpm --filter @embroidery/api exec jest --config jest.asset-intake.config.mjs --testPathPatterns=asset-intake(-lifecycle)?[.]integration` | apps/api asset-intake integration specs | Asset intake API, policy or lifecycle changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-ASSET-INTAKE-API` | `test:asset-intake:api` | `@embroidery/api` | API test | `pnpm --filter @embroidery/api exec jest --config jest.asset-intake.config.mjs --testPathPatterns=asset-intake-api` | apps/api asset-intake API specs | Asset intake contract or controller changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-ASSET-INTAKE-GATEWAY` | `test:asset-intake:gateway` | repository tool | gateway seam test | `node --test tools/nginx-upload-seam.test.mjs tools/nginx-upload-render.test.mjs` | tools/nginx-upload-seam.test.mjs · tools/nginx-upload-render.test.mjs | Gateway upload routing or template changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-CATALOG-DRAFT-INTEGRATION` | `test:catalog-draft:integration` | `@embroidery/api` | integration test | `pnpm --filter @embroidery/api exec jest --testPathPatterns=catalog-draft[.]integration` | apps/api catalog-draft integration specs | Catalog draft persistence or domain changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-CATALOG-DRAFT-API` | `test:catalog-draft:api` | `@embroidery/api` | API test | `pnpm --filter @embroidery/api exec jest --testPathPatterns=catalog-draft-api` | apps/api catalog-draft API specs | Catalog draft contract or controller changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-CATALOG-DRAFT-GATEWAY` | `test:catalog-draft:gateway` | repository tool | gateway seam test | `node --test tools/nginx-catalog-draft-seam.test.mjs` | tools/nginx-catalog-draft-seam.test.mjs | Gateway admin-catalog routing changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-PUBLIC-CATALOG-INTEGRATION` | `test:public-catalog:integration` | `@embroidery/api` | integration test | `pnpm --filter @embroidery/api exec jest --testPathPatterns=public-catalog[.]integration` | apps/api public-catalog integration specs | Public catalog query or repository changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-PUBLIC-CATALOG-API` | `test:public-catalog:api` | `@embroidery/api` | API test | `pnpm --filter @embroidery/api exec jest --testPathPatterns=public-catalog-api` | apps/api public-catalog API specs | Public catalog contract or controller changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-PUBLIC-CATALOG-GATEWAY` | `test:public-catalog:gateway` | repository tool | gateway seam test | `node --test tools/nginx-public-catalog-seam.test.mjs` | tools/nginx-public-catalog-seam.test.mjs | Gateway public-catalog routing changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-PUBLIC-MEDIA-INTEGRATION` | `test:public-media:integration` | `@embroidery/api` | integration test | `pnpm --filter @embroidery/api exec jest --config jest.public-media.config.mjs` | apps/api public-media integration specs | Public media delivery or derivative changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-PUBLIC-MEDIA-GATEWAY` | `test:public-media:gateway` | repository tool | gateway seam test | `node --test tools/nginx-public-media-seam.test.mjs` | tools/nginx-public-media-seam.test.mjs | Gateway public-media routing changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-ASSET-PROCESSING-INTEGRATION` | `test:asset-processing:integration` | `@embroidery/worker` | integration test | `pnpm --filter @embroidery/worker exec jest --testPathPatterns=asset-inspection-.*[.]integration --testPathIgnorePatterns=/node_modules/` | apps/worker asset-inspection integration specs | Asset inspection handler or derivative changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-ASSET-PROCESSING-WORKER-SMOKE` | `test:asset-processing:worker-smoke` | `@embroidery/worker` | smoke test | `pnpm --filter @embroidery/worker build && pnpm --filter @embroidery/worker exec jest --testPathPatterns=asset-processing-worker.smoke --testPathIgnorePatterns=/node_modules/` | apps/worker asset-processing smoke spec (requires a prior worker build) | Worker asset-processing composition changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-WORKER-RUNTIME-INTEGRATION` | `test:worker-runtime:integration` | `@embroidery/persistence + @embroidery/worker` | integration test | `pnpm --filter @embroidery/persistence exec jest --testPathPatterns=worker-job-queue && pnpm --filter @embroidery/worker exec jest --testPathPatterns=worker-runtime-.*integration` | persistence job-queue specs and worker runtime integration specs | Job queue, claim protocol or worker runtime changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-WORKER-RUNTIME-SMOKE` | `test:worker-runtime:smoke` | `@embroidery/worker` | smoke test | `pnpm --filter @embroidery/worker build && pnpm --filter @embroidery/worker exec jest --testPathPatterns=worker-smoke --testPathIgnorePatterns=/node_modules/` | apps/worker smoke spec (requires a prior worker build) | Worker bootstrap or composition changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-WORKER-RUNTIME-SIGNAL-SMOKE` | `test:worker-runtime:signal-smoke` | `@embroidery/worker` | smoke test | `pnpm --filter @embroidery/worker exec jest --testPathPatterns=worker-signal-smoke --testPathIgnorePatterns=/node_modules/` | apps/worker signal-handling smoke spec | Worker shutdown/signal handling changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-WORKER-RUNTIME-UNCOOPERATIVE-TIMEOUT` | `test:worker-runtime:uncooperative-timeout` | `@embroidery/worker` | integration test | `pnpm --filter @embroidery/worker exec jest --testPathPatterns=worker-(un)?cooperative-timeout` | apps/worker cooperative/uncooperative timeout specs | Handler timeout policy changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-WORKER-RUNTIME-FATAL-PROCESS` | `test:worker-runtime:fatal-process` | `@embroidery/worker` | integration test | `pnpm --filter @embroidery/worker exec jest --testPathPatterns=worker-fatal-timeout.process --testPathIgnorePatterns=/node_modules/` | apps/worker fatal-shutdown process spec | Worker fatal-shutdown changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-STORAGE-BOOTSTRAP-API` | `test:storage-bootstrap:api` | `@embroidery/api` | integration test | `pnpm --filter @embroidery/api exec jest --testPathPatterns="start-api|object-storage-bootstrap|build-openapi-document"` | apps/api bootstrap and OpenAPI-document specs | API startup, storage bootstrap or OpenAPI document changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-STORAGE-BOOTSTRAP-WORKER` | `test:storage-bootstrap:worker` | `@embroidery/worker` | integration test | `pnpm --filter @embroidery/worker build && pnpm --filter @embroidery/worker exec jest --testPathPatterns=storage-bootstrap-worker --testPathIgnorePatterns=/node_modules/` | apps/worker storage-bootstrap spec (requires a prior worker build) | Worker storage bootstrap changes. | `ACTIVE_SCOPED` |
| `CMD-TEST-STORAGE-BOOTSTRAP-COMPOSITION` | `test:storage-bootstrap:composition` | `@embroidery/api + @embroidery/worker` | integration test | `pnpm --filter @embroidery/api build && pnpm --filter @embroidery/worker build && pnpm --filter @embroidery/worker exec jest --testPathPatterns=storage-bootstrap-composition --testPathIgnorePatterns=/node_modules/` | cross-app storage-bootstrap composition spec (requires both builds) | Shared storage bootstrap contract changes. | `ACTIVE_SCOPED` |
| `CMD-E2E` | `e2e` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e` | default Playwright run | Browser tier. | `ACTIVE_SCOPED` |
| `CMD-E2E-SMOKE` | `e2e:smoke` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e:smoke` | Playwright smoke project | Milestone smoke. | `ACTIVE_SCOPED` |
| `CMD-E2E-FULL` | `e2e:full` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e:full` | full Playwright matrix | Release/regression. | `ACTIVE_SCOPED` |
| `CMD-E2E-APP1` | `e2e:app1` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e:app1` | APP1 Playwright project | APP1 staff-access journeys. | `ACTIVE_SCOPED` |
| `CMD-E2E-HEADED` | `e2e:headed` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e:headed` | headed Playwright run | Local debugging. | `ACTIVE_SCOPED` |
| `CMD-E2E-DEBUG` | `e2e:debug` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e:debug` | Playwright inspector | Local debugging. | `ACTIVE_SCOPED` |
| `CMD-E2E-REPORT` | `e2e:report` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e:report` | Playwright HTML report | After a browser run. | `ACTIVE_SCOPED` |
| `CMD-E2E-INSTALL` | `e2e:install` | `@embroidery/e2e-testing` | E2E | `pnpm --filter @embroidery/e2e-testing e2e:install` | Playwright browser install | First run or version bump. | `ACTIVE_SCOPED` |
| `CMD-CHECK-E2E` | `check:e2e` | `@embroidery/e2e-testing` | boundary check | `pnpm --filter @embroidery/e2e-testing check:e2e` | E2E package static boundary check | Browser-free; run with E2E changes. | `ACTIVE_SCOPED` |
| `CMD-OPENAPI-GENERATE` | `openapi:generate` | `@embroidery/api` | contract artifact | `pnpm --filter @embroidery/api openapi:generate` | regenerates packages/contracts/openapi/openapi.generated.json | Any OpenAPI operation change. | `ACTIVE_SCOPED` |
| `CMD-OPENAPI-CHECK` | `check:openapi` | `@embroidery/api` | contract drift gate | `pnpm --filter @embroidery/api openapi:check` | fails when the committed OpenAPI artifact drifts | Any OpenAPI operation change. | `ACTIVE_SCOPED` |
| `CMD-API-CLIENT-GENERATE` | `api-client:generate` | `@embroidery/api-client` | contract artifact | `pnpm --filter @embroidery/api-client generate` | Orval regeneration into packages/api-client/src/generated | After an OpenAPI change. | `ACTIVE_SCOPED` |
| `CMD-API-CLIENT-CHECK` | `check:api-client` | `@embroidery/api-client` | contract drift gate | `pnpm --filter @embroidery/api-client check:generated` | fails when the generated client drifts | After an OpenAPI change. | `ACTIVE_SCOPED` |
| `CMD-DB-MANIFEST-CHECK` | `db:check:manifest` | repository tool | database gate | `node tools/db-manifest-check.mjs` | tools/db-manifest-check.mjs | Schema or migration changes. | `ACTIVE_SCOPED` |
| `CMD-CHECK-FILE-SIZE` | `check:file-size` | repository tool | repository gate | `node tools/check-file-size.mjs` | tools/check-file-size.mjs | Any touched production/test source file. | `ACTIVE_SCOPED` |
| `CMD-CHECK-REPORT-SECRETS` | `check:secrets` | repository tool | repository gate | `node tools/check-report-secrets.mjs` | tools/check-report-secrets.mjs | Any new or edited completion report. | `ACTIVE_SCOPED` |
| `CMD-CHECK-STYLES` | `check:styles` | repository tool | frontend gate | `node tools/check-styling-boundaries.mjs` | tools/check-styling-boundaries.mjs | Any SCSS or styling change. | `ACTIVE_SCOPED` |
| `CMD-CHECK-FIGMA-DESIGN-INDEX` | `check:figma-design-index` | repository tool | design gate | `node tools/check-figma-design-index.mjs` | tools/check-figma-design-index.mjs | Any design or frontend UI checkpoint, and any registry edit. | `ACTIVE_SCOPED` |
| `CMD-CHECK-FRONTEND-BOUNDARIES` | `check:frontend-boundaries` | repository tool | frontend gate | `node tools/check-frontend-test-boundaries.mjs` | tools/check-frontend-test-boundaries.mjs | Frontend test-harness changes. | `ACTIVE_SCOPED` |
| `CMD-CHECK-FRONTEND-BUILD-BOUNDARY` | `check:frontend-build-boundary` | repository tool | post-build gate | `node tools/check-frontend-build-boundary.mjs` | tools/check-frontend-build-boundary.mjs (inspects .next; needs a prior build) | Build/CI stage after a frontend build. | `ACTIVE_SCOPED` |
| `CMD-CHECK-E2E-BOUNDARIES` | `check:e2e-boundaries` | repository tool | boundary gate | `node tools/check-e2e-boundaries.mjs` | tools/check-e2e-boundaries.mjs | E2E package structure changes. | `ACTIVE_SCOPED` |
| `CMD-CHECK-SPIKE-BOUNDARIES` | `check:spike-boundaries` | repository tool | boundary gate | `node tools/check-spike-boundaries.mjs` | tools/check-spike-boundaries.mjs (`--build` variant inspects dist) | Spike isolation; any production manifest change. | `ACTIVE_SCOPED` |
| `CMD-CHECK-LIFECYCLE` | `check:lifecycle` | repository tool | lifecycle gate | `node tools/check-lifecycle-consistency.mjs` | tools/check-lifecycle-consistency.mjs | Any LC-nn transition table or lifecycle policy change. | `ACTIVE_SCOPED` |
| `CMD-CHECK-PAGINATION-AUTHORITY` | `check:pagination-authority` | historical checkpoint | checkpoint gate (APP2-B04-C1) | `node tools/check-pagination-authority.mjs` | tools/check-pagination-authority.mjs | Public catalog pagination authority changes. | `HISTORICAL_SCOPED` |
| `CMD-CHECK-STOREFRONT-ROUTE-AUTHORITY` | `check:storefront-route-authority` | historical checkpoint | checkpoint gate (APP2-S01-G01) | `node tools/check-storefront-route-authority.mjs` | tools/check-storefront-route-authority.mjs | Storefront route authority changes. | `HISTORICAL_SCOPED` |
| `CMD-CHECK-STOREFRONT-PRODUCT-DETAIL-AUTHORITY` | `check:storefront-product-detail-authority` | historical checkpoint | checkpoint gate (APP2-S02) | `node tools/check-storefront-product-detail-authority.mjs` | tools/check-storefront-product-detail-authority.mjs | Product detail authority changes. | `HISTORICAL_SCOPED` |
| `CMD-CHECK-STOREFRONT-PRODUCT-DETAIL-CORRECTION` | `check:storefront-product-detail-correction` | historical checkpoint | checkpoint gate (APP2-S02-C1) | `node tools/check-storefront-product-detail-correction.mjs` | tools/check-storefront-product-detail-correction.mjs | Product detail correction authority changes. | `HISTORICAL_SCOPED` |
| `CMD-SPIKE-EDITOR-BUILD` | `spike:editor:build` | `@embroidery-spike/design-studio` | spike operation | `pnpm --filter @embroidery-spike/design-studio spike:build` | design-studio spike build | Spike work only. | `ACTIVE_SCOPED` |
| `CMD-SPIKE-EDITOR-TEST` | `spike:editor:test` | `@embroidery-spike/design-studio` | spike test | `pnpm --filter @embroidery-spike/design-studio spike:test` | design-studio spike tests | Any `design-document`, `design-engine` or adapter change. | `ACTIVE_SCOPED` |
| `CMD-SPIKE-EDITOR-CHECK` | `spike:editor:check` | `@embroidery-spike/design-studio` | spike gate | `pnpm --filter @embroidery-spike/design-studio spike:check` | design-studio spike static check | Any change touching the spike boundary. | `ACTIVE_SCOPED` |
| `CMD-SPIKE-EDITOR-BENCHMARK` | `spike:editor:benchmark` | `@embroidery-spike/design-studio` | benchmark | `pnpm --filter @embroidery-spike/design-studio spike:bench` | APP0-R01 S/M/L performance scenes | Deliberate performance measurement (APP3 S02/S03/S07/S11/E01). | `ACTIVE_SCOPED` |
| `CMD-SPIKE-EDITOR-BENCHMARK-LINUX` | `spike:editor:benchmark:linux` | `@embroidery-spike/design-studio` | benchmark | `pnpm --filter @embroidery-spike/design-studio spike:bench --container` | containerised benchmark run | Cross-platform performance comparison. | `ACTIVE_SCOPED` |
| `CMD-SPIKE-EDITOR-BUNDLE` | `spike:editor:bundle` | `@embroidery-spike/design-studio` | spike operation | `pnpm --filter @embroidery-spike/design-studio spike:bundle` | design-studio spike bundle analysis | Spike work only. | `ACTIVE_SCOPED` |
| `CMD-SPIKE-EDITOR-ASSETS` | `spike:editor:assets` | `@embroidery-spike/design-studio` | spike operation | `pnpm --filter @embroidery-spike/design-studio spike:assets` | design-studio spike asset preparation | Spike work only. | `ACTIVE_SCOPED` |
| `CMD-SMOKE-APP1-BOOTSTRAP` | `smoke:app1-bootstrap` | historical checkpoint | smoke (APP1) | `node tools/smoke-app1-bootstrap-compose.mjs` | tools/smoke-app1-bootstrap-compose.mjs | Staff bootstrap or compose changes. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-PUBLICATION-PRODUCTION` | `smoke:app2-publication` | historical checkpoint | smoke (APP2) | `node tools/smoke-app2-publication-production.mjs` | tools/smoke-app2-publication-production.mjs | Publication path on the production topology. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-T01-PUBLIC-MEDIA` | `smoke:app2-t01-public-media` | historical checkpoint | smoke (APP2-T01) | `node tools/smoke-app2-t01-public-media.mjs` | tools/smoke-app2-t01-public-media.mjs | Public media delivery, dev topology. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-T01-PUBLIC-MEDIA-PRODUCTION` | `smoke:app2-t01-public-media:production` | historical checkpoint | smoke (APP2-T01-C1) | `node tools/smoke-app2-t01-public-media-production.mjs` | tools/smoke-app2-t01-public-media-production.mjs | Public media delivery, production topology. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-B04-PUBLIC-CATALOG` | `smoke:app2-b04-public-catalog` | historical checkpoint | smoke (APP2-B04) | `node tools/smoke-app2-b04-public-catalog.mjs` | tools/smoke-app2-b04-public-catalog.mjs | Public catalog queries, dev topology. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-B04-PUBLIC-CATALOG-PRODUCTION` | `smoke:app2-b04-public-catalog:production` | historical checkpoint | smoke (APP2-B04) | `node tools/smoke-app2-b04-public-catalog-production.mjs` | tools/smoke-app2-b04-public-catalog-production.mjs | Public catalog queries, production topology. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-S01-DISCOVER-PRODUCTION` | `smoke:app2-s01-discover:production` | historical checkpoint | smoke (APP2-S01) | `node tools/smoke-app2-s01-discover-production.mjs` | tools/smoke-app2-s01-discover-production.mjs | Discover feed on the production topology. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-S02-DETAIL-PRODUCTION` | `smoke:app2-s02-detail:production` | historical checkpoint | smoke (APP2-S02) | `node tools/smoke-app2-s02-detail-production.mjs` | tools/smoke-app2-s02-detail-production.mjs | Product detail on the production topology. | `HISTORICAL_SCOPED` |
| `CMD-SMOKE-APP2-E01-PUBLICATION-PRODUCTION` | `smoke:app2-e01-publication:production` | historical checkpoint | smoke (APP2-E01) | `node tools/smoke-app2-e01-publication-production.mjs` | tools/smoke-app2-e01-publication-production.mjs | Cross-layer publication journey. | `HISTORICAL_SCOPED` |
| `CMD-BENCH-DB9` | `bench:db9` | `@embroidery/api` | benchmark | `pnpm --filter @embroidery/api bench` | DB9 query benchmark harness | Deliberate database performance measurement. | `ACTIVE_SCOPED` |
| `CMD-EXPLAIN-Q01-PUBLIC-CATALOG` | `explain:q01` | repository tool | diagnostic | `node tools/explain-q01-public-catalog.mjs` | tools/explain-q01-public-catalog.mjs | Q-01 plan inspection during pagination/index work. | `ACTIVE_SCOPED` |

## 3.1 Commands added after `GOV-Q01-C1`

These were never root aliases and never may be — they are listed here because
this file, not `package.json`, is where a command is discovered. The `Former
root alias` column is dropped rather than filled with a fiction.

The `APP3-G01`…`G03` gates belong here too: `GOV-Q01` removed their aliases one
commit *before* this index existed, so the §3 sweep of 71 rows never saw them
and they have been undiscoverable since. `APP3-G04` indexes them rather than
leaving the hole open.

| Command ID | Owner | Category | Direct invocation | Source / target | Usage scope | Status |
|---|---|---|---|---|---|---|
| `CMD-CHECK-APP3-G01` | repository tool | checkpoint gate (APP3-G01) | `node tools/check-app3-g01.mjs` | tools/check-app3-g01.mjs | Any edit to APP3 placement authority, §6.4, IMP-D041 or the placement schema. | `ACTIVE_SCOPED` |
| `CMD-CHECK-APP3-G02` | repository tool | checkpoint gate (APP3-G02) | `node tools/check-app3-g02.mjs` | tools/check-app3-g02.mjs | Any edit to Template lifecycle authority, §6.5, IMP-D042, LC-24/LC-04 or the Template schema. Chains G01. | `ACTIVE_SCOPED` |
| `CMD-TEST-APP3-G02` | repository tool | checkpoint gate tests | `node --test tools/check-app3-g02.test.mjs` | tools/check-app3-g02.test.mjs | Any edit to `check-app3-g02.mjs` or the inputs it parses. | `ACTIVE_SCOPED` |
| `CMD-CHECK-APP3-G03` | repository tool | checkpoint gate (APP3-G03) | `node tools/check-app3-g03.mjs` | tools/check-app3-g03.mjs, tools/check-app3-g03-security.mjs | Any edit to anonymous Session authority, §6.6, IMP-D043, LC-07 or the Session schema. Chains G02. | `ACTIVE_SCOPED` |
| `CMD-TEST-APP3-G03` | repository tool | checkpoint gate tests | `node --test tools/check-app3-g03.test.mjs` | tools/check-app3-g03.test.mjs | Any edit to the G03 checkers or the inputs they parse. | `ACTIVE_SCOPED` |
| `CMD-CHECK-APP3-G04` | repository tool | checkpoint gate (APP3-G04) | `node tools/check-app3-g04.mjs` | tools/check-app3-g04.mjs, tools/check-app3-g04-media.mjs | Any edit to editor-media authority, §6.7, IMP-D044, the asset/derivative schema or the APP3 asset contract. Chains G03. Reports its schema mode: `REQUIRED_SCHEMA_CONTRIBUTION_PENDING` before `APP3-DB01`, `DERIVATIVE_METADATA_IMPLEMENTED` after it. | `ACTIVE_SCOPED` |
| `CMD-TEST-APP3-G04` | repository tool | checkpoint gate tests | `node --test tools/check-app3-g04.test.mjs` | tools/check-app3-g04.test.mjs | Any edit to the G04 checkers or the inputs they parse. | `ACTIVE_SCOPED` |
| `CMD-CHECK-APP3-DB01` | repository tool | checkpoint gate (APP3-DB01) | `node tools/check-app3-db01.mjs` | tools/check-app3-db01.mjs, tools/check-app3-db01-placement.mjs | Any edit to migration 0034, the placement or asset-derivative schema, §6.8, or the APP3 database disposition. Chains G04. | `ACTIVE_SCOPED` |
| `CMD-TEST-APP3-DB01` | repository tool | checkpoint gate tests | `node --test tools/check-app3-db01.test.mjs` | tools/check-app3-db01.test.mjs | Any edit to the DB01 checkers or the inputs they parse. | `ACTIVE_SCOPED` |
| `CMD-TEST-APP3-DB01-INTEGRATION` | `@embroidery/database` | integration test | `pnpm --filter @embroidery/database exec jest --testPathPatterns=app3-` | app3-placement-authority / app3-derivative-metadata / app3-placement-upgrade integration specs | Any change to placement or derivative schema, migration 0034, or the guard triggers. Needs a reachable PostgreSQL; creates and drops its own disposable databases. | `ACTIVE_SCOPED` |

## 4. Adding a command

A future checkpoint:

- creates focused tests/checkers when needed, and **runs them directly**;
- adds a semantic row here when future reuse is plausible;
- **does not edit root `package.json`** unless it introduces a genuinely global
  orchestration or infrastructure command;
- states the owner and the impact reason for every validation it runs.

Command IDs are stable and unique. Never renumber one; supersede it with a new
id and mark the old row's status instead.

## 5. Related authority

- [`VALIDATION_GOVERNANCE.md`](./VALIDATION_GOVERNANCE.md) — which validations
  run, when and why; the three global controls; the full-regression triggers.
- [`07-TESTING-AND-ACCEPTANCE-GATES.md`](./07-TESTING-AND-ACCEPTANCE-GATES.md) —
  required evidence by checkpoint and phase.
- [`reports/GOV-Q01-C1-COMPLETION-REPORT.md`](./reports/GOV-Q01-C1-COMPLETION-REPORT.md)
  — the correction that produced this index.

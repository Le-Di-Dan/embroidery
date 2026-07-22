# Backend Runtime Package-Build — Completion Report

**Type:** Platform/backend checkpoint (independent of the styling checkpoints). Fixes the api/worker production runtime crash caused by Node resolving workspace packages to TypeScript source. Decision recorded as `IMP-D018`.

## A. Preflight

- **Branch:** `production`
- **Initial HEAD:** `86a082ae3d3c651057627a8df28a0e6b48c9a530` (`feat(styles): integrate global Sass entries and guardrails`).
- **Initial working tree:** clean.
- **Dependency scope audited:** the api/worker runtime graph is exactly two runtime-bearing workspace packages — `@embroidery/persistence` → `@embroidery/database` (→ `drizzle-orm`, `pg`, `uuidv7`). No other workspace package (`contracts`, `api-client`, `domain-types`, `observability`, `validation`, `design-*`, `ui`, `styles`) is imported by api/worker runtime code.

## B. Root cause

- The compiled API (`node dist/main.js`) executed `require('@embroidery/persistence')`, which Node resolved via that package's `main: ./src/index.ts` to **raw TypeScript**, throwing `SyntaxError: Unexpected token 'export'`. The worker failed identically.
- Every consumed workspace package declared `main`/`types`/`exports` → `./src/*.ts` and had **no build step** (JIT TypeScript-source design). This is fine for Next.js (webpack transpiles) and ts-jest, but a plain Node runtime cannot load `.ts`.
- Because the packages exposed `.ts` source, `tsc` also pulled their sources into the API's own program, so `nest build` emitted a **nested** `dist/apps/api/src/main.js` instead of `dist/main.js` — a second symptom of the same cause.
- Runtime-bearing vs type-only: both `@embroidery/database` and `@embroidery/persistence` are runtime-bearing (Nest modules, Drizzle client/repositories, stores, DI providers). They were the only packages needing compilation.
- Pre-existing and unrelated to the styling checkpoints; it only surfaced once the SCSS work let the images build and the backend containers actually start. `tsx`/esbuild were ruled out — NestJS DI requires `emitDecoratorMetadata`, which esbuild does not emit.

## C. Implementation

**Build contract (`IMP-D018`):** runtime-bearing packages compile to `dist` (CommonJS + declarations); `main`/`types`/`exports` point to `dist`; no bundler/TS-runtime substitute.

- **`@embroidery/database`**: added `tsconfig.build.json` (`module: CommonJS`, `moduleResolution: Node`, `declaration`, `sourceMap`, `outDir: dist`, `rootDir: src`; excludes `*.spec.ts`/`*.test.ts` and `src/cli/**` — the CLI uses `import.meta` and runs via `tsx` on source). `main`/`types` → `dist`; `exports` for `.`, `./schema`, `./testing` → `{ types, default }` in `dist`. Added `build`/`clean` scripts and `rimraf`.
- **`@embroidery/persistence`**: added `tsconfig.build.json` (inherits NestJS CommonJS + decorator metadata; emits declarations; excludes specs and `src/testing/**` test infrastructure). `main`/`types`/`exports` → `dist`. Added `build`/`clean` scripts and `rimraf`.
- **`apps/api` & `apps/worker`**: moved `@embroidery/database` from `devDependencies` to `dependencies` (it is a runtime dependency; matters for `--prod` installs). Excluded `src/**/tests/**` from each `tsconfig.build.json` so the production build no longer pulls test fixtures (which import the `/testing` subpath) — the API/worker builds are now **flat** `dist/main.js`, and the existing `start`/runner entrypoints (`node dist/main.js`) are correct unchanged.
- **Build orchestration:** Turborepo already declares `build.dependsOn: ["^build"]` with `dist/**` outputs, so `@embroidery/database` → `@embroidery/persistence` → api/worker build in dependency order deterministically from a clean checkout.
- **Docker:** `dev` stage of `api.Dockerfile`/`worker.Dockerfile` runs `pnpm --filter "@embroidery/persistence..." build` after `COPY`, so the package `dist` is present before `nest start --watch`. `build` stage uses `pnpm --filter "@embroidery/<app>..." build` (dependency graph first). `runner` stage copies `packages/{database,persistence}/dist` + their `package.json` so the production `node_modules` symlinks resolve to compiled JS. All four Dockerfiles already copy `packages/styles/package.json` (prior checkpoint).
- **Compose:** added `DATABASE_URL` (compose-network form `postgres://…@postgres:5432/…`) and `depends_on: postgres (service_healthy)` to the `api` and `worker` services — required for the containers to start and pass health.
- **Migrations/SQL assets:** no change needed. The DB7 test harness locates `packages/database/migrations/**` via `findWorkspaceRoot()` (workspace-root discovery, not `__dirname`), so it works identically whether run from `src` or `dist`. The migration CLI (`db:migrate`/`db:status`) still runs via `tsx` on `src` and was intentionally excluded from the compiled output.

## D. Verification

- **Clean build graph:** removed all `dist`, then `turbo run build --filter=@embroidery/api --filter=@embroidery/worker` → 4/4 successful (database → persistence → api/worker). API/worker emit flat `dist/main.js`.
- **No runtime TS resolution:** compiled `.js` uses bare `require("@embroidery/persistence")` / `require("@embroidery/database")`; `grep` found **no** `.js` require resolving to a `src/`/`.ts` path.
- **Typecheck:** `turbo run typecheck` for database/persistence/api/worker → 6/6 successful.
- **Lint:** `turbo run lint` for the four → successful.
- **Tests (against running Postgres):** database 152/152, persistence 88/88, worker suite passed. API 397/398 in the full parallel run; the one failure was `db10-cp4-anonymization.integration.spec.ts` shelling out to `docker exec … dropdb --force` under concurrent DB load — it **passes in isolation (5/5)**, confirming an environmental flake, not a regression. No `apps/api/src` files were changed.
- **Docker cold reproducible run:** `docker:dev:down` then `docker:dev:up` (rebuilds images). Result — `postgres` healthy, `api` healthy ("database pool validated", "Nest application successfully started", "API listening on port 4000"), `worker` running ("DatabaseModule dependencies initialized", "database pool validated", "Worker started"), `storefront` healthy, `admin` healthy, `gateway` healthy. **Zero** "Unexpected token" occurrences. The image build used `pnpm install --frozen-lockfile`, proving lockfile consistency.
- **Quality gates:** `prettier --check` on changed files clean; `check-file-size` passed; `git diff --check` clean.

## E. Scope control

- No webpack/esbuild/tsx/ts-node runtime substitute; compilation only.
- No trust-proxy change; no persistence/database architecture change; no styling change.
- Only runtime-bearing packages in the api/worker graph were built (`database`, `persistence`); type-only/other packages untouched.
- No `apps/api/src` or `apps/worker/src` application code changed.
- Follow-up (out of this checkpoint's dev-focused acceptance): the production `runner` image stages were corrected for the same architecture but were not runtime-tested (the compose stack and acceptance use the `dev` target); a dedicated production-image smoke test can confirm them when the deployment pipeline is exercised.

## F. Git

- **Changed files:** `packages/database/{package.json,tsconfig.build.json}`, `packages/persistence/{package.json,tsconfig.build.json}`, `apps/api/{package.json,tsconfig.build.json}`, `apps/worker/{package.json,tsconfig.build.json}`, `infrastructure/docker/{api,worker}.Dockerfile`, `infrastructure/compose/docker-compose.dev.yml`, `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md`, this report, `pnpm-lock.yaml`.
- **Commit / HEAD / working tree / push:** recorded on commit; single commit; working tree clean; not pushed.

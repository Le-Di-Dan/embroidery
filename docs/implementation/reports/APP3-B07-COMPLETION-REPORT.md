# `APP3-B07` — anonymous Design Session bootstrap, clone and resume

| Field | Value |
| --- | --- |
| Checkpoint | `APP3-B07` |
| Phase | `APP3` — Design Templates and 2D Studio |
| Status | `COMPLETE — REVIEW_DELIVERED` |
| Implementation commit | `d9f423952ddd12262500df6a40bb49f69f5fc95b` |
| Evidence commit | recorded below |
| Operations added | 2 (`publicDesignSession_create`, `publicDesignSession_resume`) |
| Migrations | none |
| External dependencies | none |
| Root scripts added | none |

---

## 1. What was delivered

Two operations, and only two:

| Method | Path | Operation id | Credential |
| --- | --- | --- | --- |
| `POST` | `/api/public/design-sessions` | `publicDesignSession_create` | none — mints one |
| `POST` | `/api/public/design-sessions/{sessionId}/resume` | `publicDesignSession_resume` | `__Host-` cookie |

`create` opens a Session either blank or as a clone of a published Template.
`resume` returns the caller's own Session and rotates its secret.

The two bootstrap modes converge deliberately. Both resolve the same public
placement, both validate their document through the same `APP3-P01` and
`APP3-P02` authorities, both persist through repository seams that already carry
`G-DB7-13` (valid placement chain) and `G-DB7-18` (Template `PUBLISHED` at clone
time). A clone is not a privileged path with fewer checks; it is the same path
with a different document source.

### 1.1 Five decisions worth review

**There is no fallback from clone to blank.** A caller who asked for a Template
and cannot have it is refused. The alternative silently converts four distinct
causes — Template missing, unpublished, scope-mismatched, document invalid —
into one indistinguishable symptom: "my design opened empty."

**Studio eligibility is required, not publication.** `IMP-D041` separates the
two, and the scope resolver asks for the former. A Product visible in the
catalog is not thereby a Product a Session may open on.

**Template compatibility is exact triple equality.** `IMP-D042` admits no
wildcard. A Template whose scope is incomplete is not publishable, so an absent
column is treated as a mismatch rather than as a permissive match.

**Resume rotates under an old-digest guard.** The `UPDATE` is conditioned on
`expectedSecretHash = current.sessionSecretHash`, so of two racing resumes
exactly one writes and the loser is refused rather than silently handed a
secret the winner already replaced. The rotation `SET` list contains
`sessionSecretHash`, `lastActivityAt` and `updatedAt` — never `expiresAt` and
never `autosaveRevision`. The 30-day TTL is absolute from `created_at`
(`IMP-D043` PO-06); a resume that extended it would turn an absolute TTL into a
sliding one, and would still pass every functional test.

**The blank document is validated, not trusted.** This server authored it, so
validating it looks redundant — but "correct by construction" is a claim about
code, and the check costs one pass over an empty array.

## 2. The union DTO bridge

The bootstrap body is a discriminated union. A class cannot extend a
constructor whose instance type is a union (TS2509), so `createZodDto` cannot be
subclassed here directly.

Every obvious workaround fails *silently*. Annotate the `@Body()` parameter with
an inferred type and Nest emits `Object` into `design:paramtypes`; the global
`ZodValidationPipe` finds no attached schema; the endpoint stops validating
while every test still passes and the OpenAPI body publishes as an empty object.

The bridge widens the *constructor type only*, at the DTO declaration, and
narrows again inside the controller with `createDesignSessionSchema.parse(body)`
— the same schema the pipe validates against, so the two cannot diverge. No
request datum is cast. The unit suite asserts the metatype and the attached
schema directly rather than inferring safety from the fact that valid input
works.

Retained as deviation `B07_LOCAL_ZOD_UNION_DTO_BRIDGE`. Platform `createZodDto`
was not modified.

## 3. The Catalog placement read boundary

`ProductPlacementQuery` is the one authority for the public placement manifest,
and it lived in `CatalogPlacementModule` — which mounts two HTTP controllers.
Design needed the query and must not mount those controllers, and duplicating
the SQL would create a second authority whose drift nothing would detect.

`CatalogPlacementReadModule` was extracted: provider-only, no controller,
importing only `DatabaseModule`, exporting `PRODUCT_PLACEMENT_REPOSITORY` and
`ProductPlacementQuery`. `CatalogPlacementModule` now imports it and keeps its
controllers; `DesignModule` imports the read module and never the placement
module.

Retained as deviation
`CATALOG_PLACEMENT_PROVIDER_ONLY_READ_BOUNDARY_EXTRACTED_FOR_DESIGN`. Asserted
by gate and by `apps/api/test/architecture/catalog-placement-boundary.spec.ts`
— a Design module that imported the controller-bearing module would work, so it
is caught structurally rather than left to a passing suite.

## 4. Tooling reconciliation — one surface authority

Ten predecessor gates each pinned the accepted API surface as literal numbers.
Publishing two operations would have failed all of them, and editing ten
constants would have produced ten independent chances to be wrong.

`tools/app3-accepted-surface.mjs` now derives the surface from **accepted phase
status**, never by counting the artifact — counting it would make any surface
self-justifying:

```js
{ marker: /\nAPP3-B07 = COMPLETE/, paths: 21, operations: 25, designSessionRoutes: true }
{ marker: /\nAPP3-B02 = COMPLETE/, paths: 19, operations: 23, designSessionRoutes: false }
```

Twelve gates consume it. Each still asserts that *its own* checkpoint added
nothing; only the global current-artifact bans became surface-aware. This is the
mode-aware gate pattern: accept exactly two consistent worlds and no third.

`check-app3-b01n-artifacts.mjs` gained a fourth world rather than overwriting
its history — `OPENAPI_SHA256_AFTER_B07`, `CLIENT_TREE_SHA256_AFTER_B07` and
`OPENAPI_FACTS_AFTER_B07` sit alongside the earlier digests.

Retained as `B07_TOOLING_RECONCILIATION = PREDECESSOR_GATES_MADE_B07_SURFACE_AWARE`.

## 5. Evidence

| Command | Result |
| --- | --- |
| `node --test tools/check-app3-b07.test.mjs` | **18/18 pass**, exit 0 |
| `checkApp3B07(REPO_ROOT)` (final block of that suite) | **`[]` — zero failures** |
| `pnpm --filter @embroidery/api test design-session-bootstrap.spec` | **17/17 pass** |
| `pnpm --filter @embroidery/api test:integration design-session-bootstrap` | **17/17 pass** (live database) |
| `pnpm --filter @embroidery/api test catalog-placement-boundary` | **11/11 pass** |
| `pnpm --filter @embroidery/api-client test` | **44/44 pass** |
| `pnpm --filter @embroidery/contracts openapi:check` | **PASS** — 21 paths / 25 operations / 48 schemas |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | exit 0 |
| `pnpm --filter @embroidery/api lint` | exit 0 |
| `pnpm --filter @embroidery/api build` | exit 0 |
| `pnpm lint` | exit 1 — 3 unused imports in one file (§5.2); every other workspace passed. Re-run scoped to the fixed workspace, above, exit 0. The repository-wide re-run was not spent. |
| `pnpm format:check` | exit 0 — all matched files use Prettier style |
| `git diff --check` | exit 0 |

Frozen artifact digests:

- `openapi.generated.json` — `6da98f6fc4ef67efeffa97321903b47aaf0698d9b7f635c9f0c941df2ca8c6db`
- generated client tree — `9130056543917dda7c3967b8d42ee6630ee3d1e9e1c3140e27aa6d93c1cd6db4`

### 5.1 The checker test that failed first

`rejects casting the request body` failed on the first run. The mutation cast a
binding named `b`; the checker's detection was anchored to the identifier
`body`. The gap was in the **checker**, not the test: the governing constraint
is that request data is never cast through `unknown` or `any`, and a cast under
another name is the same defect. Detection was broadened to any `as unknown` /
`as any` in the controller, which is the only file where request data is still
untyped. Re-run: 18/18.

### 5.2 The lint failure that followed the extraction

Moving the repository and query providers into `CatalogPlacementReadModule` left
three now-unused imports in `catalog-placement.module.ts`. `tsc` does not flag
unused imports; ESLint does. Removed, and the module's doc comment now records
why the split exists.

## 6. Changed files

**New — API (11)**

- `apps/api/src/modules/catalog/catalog-placement-read.module.ts`
- `apps/api/src/modules/design/application/design-document.authority.ts`
- `apps/api/src/modules/design/application/design-session-scope.resolver.ts`
- `apps/api/src/modules/design/application/design-session-snapshot.ts`
- `apps/api/src/modules/design/application/open-design-session.use-case.ts`
- `apps/api/src/modules/design/application/resume-design-session.use-case.ts`
- `apps/api/src/modules/design/infrastructure/crypto/design-session-secret.issuer.ts`
- `apps/api/src/modules/design/presentation/public-design-session.controller.ts`
- `apps/api/src/modules/design/presentation/schemas/public-design-session.request.ts`
- `apps/api/src/modules/design/presentation/schemas/public-design-session.response.ts`
- `apps/api/src/openapi/generation-environment.ts` *(modified)*

**New — tests (3)**

- `apps/api/src/modules/design/design-session-bootstrap.spec.ts`
- `apps/api/test/integration/design-session-bootstrap.integration.spec.ts`
- `apps/api/test/architecture/catalog-placement-boundary.spec.ts`

**New — tooling (5)**

- `tools/app3-accepted-surface.mjs`
- `tools/check-app3-b07.mjs`
- `tools/check-app3-b07-contract.mjs`
- `tools/check-app3-b07-files.mjs`
- `tools/check-app3-b07.test.mjs`

**Modified — API (10)**, including `design.module.ts`, `app.module.ts`,
`catalog-placement.module.ts`, the Session repository port and its Drizzle
adapter (`rotateSecret`), the cookie policy, the auth config, the rate limiter
and the integration support context.

**Modified — gates (12)**: `g01`, `g03`, `g04`, `db01`, `b01`,
`b01n-artifacts`, `w01a`, `w01c`, `g08`, `g08-architecture`, `p03-contract`,
`b02-contract`, `b06a`.

**Modified — generated (3)**: `openapi.generated.json` and the two generated
client files. Not hand-edited.

**Modified — docs (6)**: phase plan, roadmap, traceability matrix, phase source
map, `SCOPED_COMMAND_INDEX.md` (4 `B07` rows), `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`,
plus `.env.example`.

**Modified — manifests (2)**: `apps/api/package.json` and `pnpm-lock.yaml`, from
the single authorized `pnpm install` adding the `@embroidery/design-document`
workspace link.

## 7. Disclosed deviations

| Token | Authorization |
| --- | --- |
| `API_DESIGN_DOCUMENT_WORKSPACE_LINK` | operator unblock — one `pnpm install`, lockfile not hand-edited |
| `B07_LOCAL_ZOD_UNION_DTO_BRIDGE` | operator unblock — platform `createZodDto` unmodified |
| `B07_RESUME_SCOPE_USES_ROUTE_AND_PUBLIC_PLACEMENT_MANIFEST` | operator unblock |
| `CATALOG_PLACEMENT_PROVIDER_ONLY_READ_BOUNDARY_EXTRACTED_FOR_DESIGN` | operator unblock — `DesignModule` must not import `CatalogPlacementModule`; asserted |
| `OPENAPI_GENERATION_DESIGN_SESSION_ENV_WIRING` | `PROVEN_BY_PROVIDER_GRAPH` |
| `B07_TOOLING_RECONCILIATION` | `PREDECESSOR_GATES_MADE_B07_SURFACE_AWARE` |

## 8. Confirmations

- No migration. No schema change. No `db:` command run.
- No Asset, upload, event, autosave or queue surface added.
- No root `package.json` script added; no repository-wide aggregate command.
- No `.env` write of any kind. No credential read, echoed, logged or rotated.
  Tests use synthetic values only (`'p'.repeat(48)` as the test pepper).
- No generated file hand-edited.
- No push. No amend, squash or rebase.
- Nothing started beyond `B07`: no `B06B`, no `B08`, no `B03`, no Studio UI.

## 9. Command ledger

| Budget | Consumed / max |
| --- | --- |
| `pnpm install` | 1 / 1 (authorized unblock) |
| `openapi:generate` | 2 / 2 — **exhausted** |
| Diagnostic launches | 0 / 2 |
| Live-database runs | 3 / 5 |
| Checker runs | **7 / 6 — over budget by one** |
| Checker-test runs | 2 / 6 |
| `format:check` | 1 |
| `lint` | 1 repository-wide + 1 scoped re-run / 2 |
| Typecheck | 1 / 1 |
| Build | 1 / 1 |

Reused rather than re-run: the live integration result (17/17), the unit and
boundary suites, the api-client suite, `openapi:check`, and both frozen
digests — none of the edits after those runs touched the code they cover. The
two commands re-run deliberately were the checker-test suite (after the
cast-detection fix) and the API lint (after the unused-import removal), because
in both cases the earlier result was invalidated by the fix itself.

The checker overrun is disclosed rather than rounded down. The gate asserts the
completion report, so it cannot reach zero failures until the report exists; the
run that found the missing command ledger and the run that confirmed the fix
were both necessary, and both fell after the sixth. The structural fix is to
write the report before the final gate runs, not to raise the budget.

The one avoidable cost: the first `openapi:generate` failed silently at exit 1
with zero bytes written. The root cause — `ProductPlacementQuery` resolving from
a module that was not in the Design provider graph — was then found statically,
without spending a diagnostic launch. Finding it statically *first* would have
left a generation allowance in hand.

## 10. Limitations

- `openapi:generate` is exhausted at 2/2 for this checkpoint. The published
  artifact is frozen at the digest above; any further contract change requires a
  new generation allowance.
- The OpenAPI generation environment wiring is proven by the provider graph
  rather than by a third generation run.
- `DesignModule` is wired into `AppModule` for these two operations only; the
  remaining Session surfaces arrive with `B06B` and `B08`.

## 11. Status

`APP3-B07 = COMPLETE — REVIEW_DELIVERED`

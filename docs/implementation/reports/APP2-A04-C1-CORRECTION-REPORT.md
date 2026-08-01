# APP2-A04-C1 — Production Gateway Runtime Correction

**Checkpoint:** `APP2-A04-C1`
**Verdict:** `PASS` — delivered in two passes. The first delivery was `BLOCKED` by a
mobile touch-target defect its own production smoke discovered; the reviewer ruled
the defect in scope, and this delivery closes it (§J, §J1, §R).
**Scope:** isolated production-runtime evidence for the Admin Product publication interaction

---

## A. Preflight and the original A04 chain

| Fact | Value |
| --- | --- |
| Branch | `production` |
| A04 Commit A | `e522e9d5d392637814b4dfbc0a0dfdaea1b5a12e` — `feat(admin): implement product publication interaction` |
| A04 Commit B | `ebd909a063f2a20f6192977b2d94b95de4f1e9bf` — `docs(app2): record Admin Product Publication evidence` |
| HEAD at entry | `b7df24f2e8572db411f3cf0cd561a125f28c4c02` |
| Tracked tree | clean |
| Pushed | nothing (44 commits ahead of `origin/production`) |
| `evidences/` | untouched, still ignored |

`APP2_A04_C1_PREFLIGHT = PASS`

### Disclosed entry deviation

§2 requires `HEAD` to equal the A04 evidence Commit B. It does not: one commit sits
above it.

`b7df24f` — `docs(security): forbid writing .env and require asking for secrets` —
is a **documentation-only governance commit the operator explicitly requested and
approved** after A04 was delivered. It touches four files
(`CLAUDE.md`, `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`, `.gitignore`,
`.env-ignore.example`), +160 lines, and none of them is A04 source, contract,
schema, Figma or any path forbidden by §11.

Both A04 commits are byte-identical to their recorded hashes, and no downstream
(`B04`/`S01`/`S02`/`E01`/`T01`) implementation exists. The deviation is disclosed
rather than silently normalised; it is not a defect and it was not created by this
correction.

### Preflight gate results

| Gate | Result |
| --- | --- |
| `pnpm check:secrets` | pass — 350 documents, 1642 tracked files |
| `pnpm check:lifecycle` | pass — LC-04: 5 transitions, exactly one `PUBLISHED → DRAFT` |
| `node --test tools/check-lifecycle-consistency.test.mjs` | 10/10 |
| `pnpm quality` | exit 0 |
| `pnpm check:openapi` | artifact up to date |
| `pnpm check:api-client` | tree hash `7f2a67a3…` unchanged |
| `pnpm check:figma-design-index` | 72 registry IDs / 72 node rows |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 |
| `pnpm db:check:manifest` | 78 tables / 833 columns |
| `git diff --check` | clean |

---

## B. The missing production evidence

A04 ran `next build` (green) and then reviewed every screen against the
**development** Admin container. Those two facts together do not establish:

- Next production startup;
- production route serving;
- production JS/CSS asset delivery;
- direct route load and hard refresh;
- gateway-to-production upstream behaviour;
- production-only hydration/runtime behaviour.

A dev-server review cannot stand in for any of them: `next dev` compiles per
request, serves unhashed development assets and an HMR channel, and never
exercises the standalone server entrypoint that production actually runs.

---

## C. The `.next` collision — corrected root cause

**The A04 report's stated mechanism is wrong, and this correction retracts it.**

A04 recorded that `apps/admin/.next` is bind-mounted, so a host `next build`
overwrote the dev server's output and made every route 404 including `/healthz`.
Neither half of that mechanism survives inspection.

### Measured facts

| Evidence | Finding |
| --- | --- |
| `docker inspect embroidery-dev-admin-1` mounts | exactly three, all `src`: `apps/admin/src`, `packages/contracts/src`, `packages/api-client/src` |
| `apps/admin/.next` | **not mounted** at all |
| `.dockerignore` | contains `**/.next` — build output cannot even enter the build context |
| Container output path | `/app/apps/admin/.next/dev`, container-internal |

### Direct reproduction attempt

With the dev stack healthy, a full host production build was run
(`pnpm --filter @embroidery/admin build`, green, registering
`ƒ /products/[productId]/publication`). Immediately afterwards:

| Probe | Before build | After build |
| --- | --- | --- |
| `/healthz` | 200 | 200 |
| `/login` | 200 | 200 |
| `/products` (unauthenticated) | 307 | 307 |
| container `.next` contents | `dev/` only | `dev/` only, timestamp unchanged |

**The collision does not reproduce.** The dev container is structurally immune: a
host build writes only to the host working tree, which is neither mounted into the
container nor readable from the image build context.

### What most likely happened instead

The route-wide failure observed during A04 is consistent with the Sass compile
error fixed in the same session — `spacing(20)` is not an approved step, and
`main.scss` is imported by the root layout, so a layout-level compile failure
takes down every route including `/healthz`. The `rm -rf .next` + restart that
appeared to fix it also cleared the cached failed compile; the actual fix was
replacing `spacing(20)` with `spacing(24)`.

This is stated as the probable cause, **not** as verified fact: the dev container's
log buffer has since rotated and no longer contains the failure window, so the
original error line could not be recovered. What *is* verified is the negative —
the bind-mount mechanism A04 blamed does not exist.

The harness still asserts `**/.next` is present in `.dockerignore` at runtime, so
the isolation this depends on fails loudly if a future edit removes it.

---

## D. Isolated production topology

```
browser → gateway (nginx, admin.embroidery.local)
        → service "admin"  ← swapped to the production container
        → node apps/admin/server.js   (NODE_ENV=production, standalone output)
```

The production runtime is an ephemeral **image** built from the canonical
`infrastructure/docker/admin.Dockerfile` `runner` stage. `next build` runs inside
an image layer, so the workspace `.next` is neither read nor written.

The service swap is a Compose override **written to a temp directory** for the
duration of the run and deleted afterwards — no tracked Nginx or Compose file is
modified, satisfying §5 and §11 together. It targets the same Compose project, so
the gateway keeps proxying its `admin` upstream by service name and that name now
resolves to the production container. That is what makes this a gateway proof
rather than a host-port proof.

---

## E. Harness and cleanup model

`tools/smoke-app2-publication-production.mjs` (orchestration, isolation, restore)
and `tools/smoke-app2-publication-browser.mjs` (browser assertions only), exposed
as `pnpm smoke:app2-publication`.

Phases: `verify-isolation → build-image → swap-upstream → smoke → restore → cleanup`.

Teardown is derived from **what the run changed**, not from whether it passed:
`cleanupPlan({swapped, imageTag, envFile})` returns the ordered steps and the
`finally` block executes exactly that plan. A thrown assertion therefore tears down
along the same path a success does — the developer's Admin can never stay swapped
because a scenario failed.

Credential handling follows `CLAUDE.md` §8a / `docs/09` §9a: the harness never reads
the repository `.env` for a secret, receives the login through its own process
environment for one run, forwards it to Playwright through a child environment
(never `argv`), and redacts it from every line it prints.

---

## F. Harness tests (Docker-free)

`tools/smoke-app2-publication-production.test.mjs` — **25/25 pass**, inside the
existing `tools/*.test.mjs` aggregation run by `pnpm test`, so these are enforced on
every quality run without Docker. The Docker smoke itself is deliberately **not** in
`pnpm quality`.

| §6 requirement | Covered by |
| --- | --- |
| isolated path differs from active dev `.next` | `.dockerignore` excludes `**/.next`; override contains no dev output path |
| cleanup runs after success | identical plan on both outcomes |
| cleanup runs after simulated failure | same, plus teardown proven to sit inside `finally` |
| dev-service restore is mandatory | restore built from the dev Compose file alone, `--force-recreate`, always step one |
| gateway target is `admin.embroidery.local` | constant asserted; no direct `:300x` port in either file |
| credentials absent from arguments/logs | `argsAreCredentialFree`, `redactSecrets`, no `.env` read, no `dotenv` |
| downstream commands absent | no `B04`/`S01`/`S02`/`E01`/`T01`/`san-pham`/`storefront` marker; only the `admin` service is touched |

Seven further regressions were added with the touch-target fix:

| Property | Assertion |
| --- | --- |
| threshold matches the design system | `TOUCH_TARGET_MIN === 44` **and** `_layout.scss` declares `$size-touch-target-min: 44px` — the smoke and the stylesheet cannot drift apart |
| fix uses the approved token | back-link rule contains `min-height: styles.$size-touch-target-min`, `inline-flex`, `align-items: center`, and **no** hardcoded `min-height: <n>px` |
| link semantics preserved | screen still renders `<Link className="product-publication__back" href={ADMIN_PRODUCTS_ROUTE}>` |
| exclusion is closed and bounded | `TOUCH_TARGET_EXCLUSIONS` deep-equals `['admin-shell__skip-link']`, is frozen, and is not a regex |
| the back link cannot be filtered out | measurement consults only the named list; `product-publication__back`, `publish-action` and `unpublish-action` are asserted absent from it |
| every control-owning state is measured | `blocked-draft`, `ready-draft`, `published`, `unpublish-dialog` all appear as measured states; geometry via `getBoundingClientRect()` |
| failures are actionable | an undersized control reports `selector`, `name`, `height` and `width` |

---

## G. Gateway-to-production proof

Captured live while the swap was in place, from non-secret runtime facts only. No
diagnostic endpoint was added.

| Fact | Development (before/after) | Production (during smoke) |
| --- | --- | --- |
| Container command | `pnpm --filter @embroidery/admin dev` | `node apps/admin/server.js` |
| `NODE_ENV` | `development` | `production` |
| Image | `embroidery-dev-admin` | `embroidery-a04c1-admin-prod:<run>` |
| Bind mounts | 3 (`apps/admin/src`, `packages/contracts/src`, `packages/api-client/src`) | **0** |
| Gateway `/healthz` via `admin.embroidery.local` | 200 | 200 |

The zero-mount count is the decisive fact: the swapped container cannot be serving
the working tree, because the working tree is not mounted into it. The gateway
reached it by service name, so this is a gateway proof, not a host-port proof.

## H. Route, asset and hard-refresh proof (production)

| Check | Result |
| --- | --- |
| `/healthz` | 200 |
| `/login` | 200 |
| `/products` unauthenticated | 307 → `/login` |
| Direct load of `/products/{id}/publication` | 7 requirement rows rendered |
| Hard refresh of that route | 7 requirement rows rendered |
| `/_next/*` responses ≥ 400 | 0 |
| Console errors (hydration/runtime) | 0 |

## I. Desktop scenarios (1440)

| Scenario | Result |
| --- | --- |
| Unauthenticated `/products` is protected | pass — lands on `/login` |
| Login through the gateway | pass |
| Blocked DRAFT: seven requirement rows | pass — 7 |
| Blocked DRAFT: publish `aria-disabled` | pass — `"true"` |
| Ready DRAFT: publish enabled | pass |
| Ready DRAFT: no `/san-pham` link | pass — 0 links |
| Ready DRAFT: all seven requirements listed | pass — 7 |
| Publish: success announced in place, no full reload | pass |
| PUBLISHED: `Gỡ xuất bản` + `Xem chi tiết`, no edit affordance | pass |
| Unpublish dialog: `alertdialog`, focus enters | pass |
| Unpublish dialog: idle Escape dismisses, focus returns | pass |
| Unpublish: returns to DRAFT with success | pass |

## J. Mobile scenarios (390) — first delivery, the finding

This section records the defect **as first found**. It is deliberately preserved:
the correction's value lies in having caught it, and erasing the finding would hide
that A04's recorded mobile result was wrong.

| Scenario | First delivery |
| --- | --- |
| No horizontal overflow | pass |
| Dialog fits | pass |
| Controls meet the 44px touch target | **FAIL** |

Measured undersized interactive elements at 390 px:

| Element | Height | Assessment |
| --- | --- | --- |
| `a.admin-shell__skip-link` | 32 px | **Excluded, with reason.** Parked off-canvas via `transform: translateY(-200%)` and revealed only on `:focus-visible`. A keyboard affordance in the APP1 shell, never a touch target. |
| `a.product-publication__back` (`← Danh sách sản phẩm`) | **16 px** | **Genuine A04 shortfall.** A real, tappable navigation control. |

`product-publication.scss` styles `.product-publication__back` with colour,
`font-size` and `text-decoration` only — no `min-height`, no padding, no
`inline-flex` box. Its height is therefore just the line box of
`$font-size-body-s`: 16 px, which fails the 44 px target in §8 and also fails
WCAG 2.5.8 (24 px, AA).

**It is not a production-only defect.** It is pure CSS and behaves identically in
development, which means A04's recorded mobile result ("44px controls") was
overstated rather than newly broken. On the first delivery this placed the fix
outside C1's stated scope (§2, §10, §11), so it was reported as the blocker rather
than quietly patched, quietly narrowed away, or deferred to a follow-up.

## J1. Reviewer scope ruling and the fix

The reviewer ruled:

> the 16px `a.product-publication__back` target is a genuine A04 defect; the
> project requirement applies to this interactive navigation control; the defect
> must be repaired inside the still-unaccepted A04-C1.

The option of narrowing "44px controls" to the publish/unpublish buttons was
explicitly rejected. C1's scope was extended once to close the defect its own
required smoke discovered.

### The change

One rule, in `apps/admin/src/features/products/styles/product-publication.scss`:

```scss
.product-publication__back {
  display: inline-flex;
  align-items: center;
  min-height: styles.$size-touch-target-min;
  /* colour, font-size, text-decoration and focus treatment unchanged */
}
```

`$size-touch-target-min` (44px) is the **existing approved token** in
`packages/styles/src/settings/_layout.scss`, already used by the Admin shell, the
product list, the product form, the assets screen and staff login. No new token was
introduced and no literal pixel value was hardcoded — a harness test asserts both.

### Before and after

| | First delivery | After the fix |
| --- | --- | --- |
| `a.product-publication__back` computed height at 390 px | **16 px** | **44 px** (`min-height` token; the label's own line box is 16 px) |
| Undersized controls, blocked DRAFT | — | 0 |
| Undersized controls, ready DRAFT | 1 | 0 |
| Undersized controls, PUBLISHED | — | 0 |
| Undersized controls, unpublish dialog | — | 0 |

What deliberately did **not** change: the label text, the `<Link>` semantics, the
`ADMIN_PRODUCTS_ROUTE` destination, the focus treatment, and the desktop
composition. The element remains a flex item in the header column, so it keeps its
existing full-width box and simply grows to a usable height. A harness test asserts
the link is still a `<Link>` on the same route, so a later "simplification" into a
button cannot pass silently.

### Regression coverage

The production smoke's mobile assertion was rewritten from a single-screen check
into a sweep across **all four A04 states that own controls** — blocked DRAFT,
ready DRAFT, PUBLISHED and the open confirmation dialog — covering the back link,
publish, edit/complete-draft, unpublish trigger, view-detail link and the dialog
actions. It measures computed `getBoundingClientRect()` geometry against the 44px
minimum and reports selector, accessible name and measured size for any failure.

Measuring only the first screen is exactly how the original review missed this, so
the fix and the widened measurement land together.

The measurement moved into its own module,
`tools/smoke-app2-publication-targets.mjs`, for two reasons: the scenario file
crossed the 400-line hard limit, and the single permitted exclusion now lives in
one obvious place where widening it is a visible act rather than an edit buried
among assertions.

## K. Exact-code error — real, not faked

Reproduced by holding two tabs on the same pre-transition `expectedUpdatedAt`,
committing in one, then committing the now-stale token in the other. The server
answered `PRODUCT_VERSION_CONFLICT` (HTTP 409) and the screen opened the approved
conflict dialog (`Sản phẩm đã được cập nhật ở nơi khác`).

Leak scan of the rendered page for `PRODUCT_VERSION_CONFLICT`, `requestId`,
`stack`, `SQL`, `updated_at`: **0 hits**. The operator sees approved copy and a
reload affordance; the domain code never reaches the DOM.

The browser additionally logs `Failed to load resource: … 409 (Conflict)` for that
request. That is the browser's own network log for a refusal this smoke
deliberately induces, not an application error, so the console-error assertion
excludes resource-load lines — asset delivery is asserted separately from the
response stream, and every API failure path is asserted by its own scenario.

## L. Fixes carried by this correction

**No production-only defect was found.** Production mode reproduced nothing that
development mode does not also exhibit — every A04 behaviour it exercised behaved
as A04 recorded it.

The one source change is the mobile touch-target repair of §J1, carried under the
reviewer's explicit scope extension rather than under the production-only rule.

Every A04 behaviour that production mode exercised behaved as A04 recorded it. The
two scenario failures in the first run were defects in this harness, not in A04:

| First-run failure | Cause | Resolution |
| --- | --- | --- |
| `direct route load + hard refresh` | anchored on `Điều kiện xuất bản`, a copy key that is **never rendered** | re-anchored on the real requirement rows |
| `blocked DRAFT: seven requirement rows` (0) | invented `data-testid="publication-requirement"` | corrected to the real `requirement-<code>` anchors |
| version-conflict scenario threw | expected the mismatch banner; the real affordance is `ProductConflictDialog` | corrected, and its state restore moved into a `finally` |
| `dev stack healthy after restore` (502) | probed before the restored `next dev` finished its first compile | bounded readiness poll added |

Incidental observation, not a defect and not changed here:
`PRODUCT_PUBLICATION_COPY.screen.requirementsHeading` ("Điều kiện xuất bản") is
defined but referenced nowhere in `apps/admin/src` or `apps/admin/test` — dead copy.

## M. Dev-stack restoration

| Fact | At entry | After the final run |
| --- | --- | --- |
| Container command | `pnpm --filter @embroidery/admin dev` | identical |
| Bind mounts | 3 | 3 |
| Health | healthy | healthy |
| Gateway `/healthz` | 200 | 200 |
| Gateway `/login` | 200 | 200 |
| Container `.next` | `dev/` only | `dev/` only |
| Temporary images (`embroidery-a04c1-admin-prod`) | — | 0 remaining |
| Temporary override directory | — | removed |

The active dev `.next` was never replaced by production output: the production
build ran inside an image layer and the swapped container carried no mounts at all.

## N. Product, Audit and Outbox evidence

| Metric | Entry | Exit |
| --- | --- | --- |
| Products | 26 DRAFT / 3 ARCHIVED | 26 DRAFT / 3 ARCHIVED |

Mutable Product state is restored: every product the smoke published was
unpublished again, and the one product stranded PUBLISHED by the first run's thrown
scenario was returned to DRAFT **through the application's own
`adminProduct_unpublish` endpoint**, not by raw SQL.

Durable, append-only evidence remains and is **not** claimed to be zero:

| Durable record | Entry | Exit | Growth |
| --- | --- | --- | --- |
| `audit_events` `product.published` | 3 | 17 | +14 |
| `audit_events` `product.unpublished` | 3 | 17 | +14 |
| `outbox_events` `PENDING` | 6 | 34 | +28 |
| `outbox_events` `DISPATCHED` | 1 | 1 | 0 |

The publish and unpublish counts grew by the same amount, which is the evidence
that every publish this correction performed was reversed — the balance, not an
assertion, is what shows the lifecycle was left where it started. Six smoke runs
were executed across both deliveries (one first pass, three after harness
corrections, two after the touch-target fix), and the widened mobile sweep performs
an additional publish/unpublish cycle per run.

These are append-only by design and no dispatcher exists in APP2. No audit or
outbox row was deleted. Staff session rows were created by the logins this
correction performed; none were removed.

No credential was rotated. No screenshots, traces or fixtures are committed.

## O. Frozen artefacts

| Artefact | Baseline | Observed |
| --- | --- | --- |
| OpenAPI hash | `c100df4e…58323` | unchanged |
| Generated client tree | `7f2a67a3…1da5f` | unchanged |
| OpenAPI shape | 13 paths / 16 operations / 27 schemas | unchanged |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECKs | unchanged |
| Figma | 72 IDs / 72 node rows | unchanged |

No change to `apps/api`, `apps/storefront`, `apps/worker`, `packages/database`,
`packages/object-storage`, OpenAPI, generated client, Figma registry, tracked Nginx
or Compose files, dependencies or the lockfile.

---

## P. Commit C

### History

Nothing was ever pushed, so the first delivery's `BLOCKED` pair was rewritten in
place rather than appended to. The correction still ends with exactly two commits.

| | First delivery (superseded) | This delivery |
| --- | --- | --- |
| Commit C | `526deacf6687545b82d5508f11487ab5af788930` | `f25abe0bbc50cac5410970bb7fb3f9b769b4f9c5` |
| Commit D | `0e6d64161b6cb46a5a7b4239ec72a71dc75a24a2` | (this report) |

A04 Commit A (`e522e9d5…`) and Commit B (`ebd909a0…`) are untouched by both.

### Rewritten Commit C

```text
f25abe0bbc50cac5410970bb7fb3f9b769b4f9c5
test(admin): add isolated production publication smoke
6 files changed, 1141 insertions(+)
```

| File | Lines | Purpose |
| --- | --- | --- |
| `tools/smoke-app2-publication-production.mjs` (new) | 386 | orchestration, isolation, restore, cleanup |
| `tools/smoke-app2-publication-browser.mjs` (new) | 376 | browser scenarios only |
| `tools/smoke-app2-publication-targets.mjs` (new) | 64 | touch-target measurement and the single exclusion |
| `tools/smoke-app2-publication-production.test.mjs` (new) | 306 | 25 Docker-free regressions |
| `apps/admin/src/features/products/styles/product-publication.scss` (modified) | +8 | the §J1 touch-target fix |
| `package.json` (modified) | +1 | `smoke:app2-publication` script |

No report and no status pointers. The only source change is the eight-line style
fix; no component, model, service, hook or test of A04 was altered.

## Q. Validation

| Command | Result |
| --- | --- |
| `node --test tools/smoke-app2-publication-production.test.mjs` | **25/25** |
| Focused A04 suite, run 1 | 5 suites / 98 tests passed |
| Focused A04 suite, run 2 | 5 suites / 98 tests passed — identical |
| `pnpm --filter @embroidery/admin lint` | pass (via `pnpm quality`) |
| `pnpm --filter @embroidery/admin typecheck` | pass (via `pnpm quality`) |
| `pnpm --filter @embroidery/admin test` | 46 suites / **519 tests** passed — unchanged from A04 |
| `pnpm --filter @embroidery/admin build` | pass; registers `ƒ /products/[productId]/publication` |
| `pnpm smoke:app2-publication` (after the fix) | **11/11 harness, 20/20 browser** |
| `pnpm smoke:app2-publication` (again, after the module split) | **11/11 harness, 20/20 browser** — re-run because the split changed code that had already passed |
| `pnpm --filter @embroidery/frontend-testing test` | 4 suites / 10 tests passed |
| `pnpm check:styles` | pass — 4 apps, 582 files |
| `pnpm check:frontend-boundaries` | pass |
| `pnpm check:frontend-build-boundary` | pass — 2423 built files scanned |
| `pnpm check:e2e` | pass — 32 tests collect, Playwright pinned 1.61.1 |
| `pnpm check:secrets` | pass |
| `pnpm check:lifecycle` + tool test | pass; 10/10 |
| `pnpm check:openapi` / `check:api-client` | unchanged |
| `pnpm check:figma-design-index` + tool test | pass; 31/31 |
| `pnpm db:check:manifest` | pass |
| `node tools/check-file-size.mjs` | pass — 23 files above the review threshold. The scenario file first breached the **400-line hard limit** at 418 lines when the mobile sweep was added; it was split by responsibility (measurement into `smoke-app2-publication-targets.mjs`), not trimmed to fit: 376 / 386 / 306 / 64 lines |
| `git diff --check` | clean |

Substitutions: `pnpm --filter @embroidery/admin lint`/`typecheck` were executed as
part of `pnpm quality` rather than separately. `check:frontend-build-boundary` was
run against a real `next build` output; that build directory was removed afterwards
because it did not exist at entry.

No command is reported here that was not run.

## R. Acceptance

**Verdict: `PASS`.**

Everything this correction was raised to establish was established:

- the original deviation is reproduced and explained;
- the `.next` collision claim is **disproven** and corrected (§C);
- a real `NODE_ENV=production` build and standalone start served the gateway;
- the gateway reached production, not development, with zero bind mounts;
- production output was isolated from the active dev `.next`, with no tracked
  Nginx or Compose change;
- the harness is repeatable, bounded, cleanup-safe and credential-safe, with 18
  Docker-free regressions in the ordinary test aggregation;
- direct route load, hard refresh, asset delivery and console cleanliness all pass;
- one real exact-code error was observed without leaking;
- the dev stack and all mutable Product state were restored exactly;
- accepted A04 behaviour is preserved (519/519 unchanged).

and, under the reviewer's scope extension, the one criterion that had failed now
passes on its merits rather than by redefinition:

- `a.product-publication__back` measures 44 px at 390 px, built from the existing
  `$size-touch-target-min` token;
- all A04 controls across blocked DRAFT, ready DRAFT, PUBLISHED and the open
  confirmation dialog meet the 44 px minimum — `undersized: []`, four states;
- the link is still a `<Link>` on the unchanged `ADMIN_PRODUCTS_ROUTE`, with its
  label and focus treatment intact and no new horizontal overflow;
- the smoke measures computed geometry and **cannot** be made to pass by excluding
  the back link: the only exclusion is a frozen, named, single-entry list, and a
  harness test asserts the publication selectors are absent from it.

The first delivery's 16 px finding is preserved verbatim in §J. It is the evidence
that the correction did its job — a production smoke that finds nothing proves
nothing, and A04 had recorded this exact criterion as passing.

The `.next` bind-mount retraction in §C stands unchanged.

## S. APP2-B04 handoff

```text
APP2-A04    = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-A04-C2 = MUST_NOT_BE_CREATED
APP2-B04    = READY — NOT STARTED
APP2-S01 / APP2-S02 = BLOCKED_BY_APP2-B04
APP2-T01    = ROUTED — NOT PLANNED_FOR_EXECUTION
```

`APP2-B04` inherits from this correction:

- a production Admin runtime is reachable through the gateway on demand
  (`pnpm smoke:app2-publication`), so B04's public-route work can be verified in
  production mode from day one rather than at a later correction;
- the public Product route is still undelivered, and nothing in A04 claims
  otherwise — the bare read-only slug and the absence of any `/san-pham/<slug>`
  link were both re-verified in production mode;
- `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` and `FU-APP2-PRODUCT-ARCHIVE-UI-01`
  remain open and untouched.

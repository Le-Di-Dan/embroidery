# APP5-E01 — Cross-Layer Acceptance — Completion Report

## Verdict

```text
APP5-E01 = COMPLETE_WITH_NONBLOCKING_FOLLOWUPS
```

Six serial acceptance tests, all green, across four journeys and 44 recorded
proofs. One integration defect was found and corrected inside E01; every other
open item stays nonblocking and is carried unchanged.

---

## 1. Baseline

```text
branch          production
entry HEAD      7fdb68f  docs(app5): record the A02 commit hash in its completion report
APP5-A02        3f6b800  feat(app5): read and moderate one custom request as an operator
pre-E01 audit   docs/implementation/reports/APP5-PRE-E01-DEBT-AUDIT.md (uncommitted at entry,
                committed with this checkpoint) — its one correction, the approved
                `commission` shell nav item routed to `/yeu-cau/moi`, is part of this baseline
                and is what `E01-01` proves end to end.
```

---

## 2. Journey matrix

| Journey | Boundaries exercised | Real / stubbed seams | Result |
|---|---|---|---|
| **A — customer-owned request** (`E01-01`, `E01-02`) | Storefront shell nav → `/yeu-cau/moi` → subject chooser → APP4 verification (issue, deliver, verify) → `APP5-B02` upload → APP2/APP3 inspection worker → `APP5-B01` submit → `APP5-S02` confirmation | **Real:** navigation, route, generated client, gateway, API controllers/use-cases, PostgreSQL, MinIO, the inspection job, the notification job, browser rendering. **Deterministic seam:** the notification *transport* is `APP4-W01`'s recording adapter, and the worker is stepped one job at a time (`APP4-E01-H02`'s accepted mechanism) rather than polled. **Fixture:** none — every APP5 fact is produced by the application. | **PASS** |
| **B — catalog request** (`E01-03`) | `APP3-B07` session open → resume handle → `/yeu-cau/moi?san-pham…` → `APP5-B07` variant read → explicit selection → APP4 verification → `APP5-B01` submit | **Real:** the session is opened by the real public `APP3-B07` route from the Storefront origin (its `HttpOnly` cookie is set by the browser), the variant list is a real `APP5-B07` read, the submit authorizes that cookie. **Fixture:** the catalog rows themselves — one published Product under a public Category, one placement, two active Variants — created through the API's *own* repositories; and the Studio *UI* is not traversed (APP3's surface), only the handle it would have left. | **PASS** |
| **C — secure-link status** (`E01-05`) | delivered `#t=` link → `/truy-cap` → fragment strip → `APP5-B03` → rendered status | **Real:** the grant and its notification are issued by `APP5-B01` inside the submission transaction, delivered by the real `APP4-W01` execution seam, and the link is navigated in the browser. **Deterministic seam:** the link is read from the recording adapter (no debug endpoint exists and none was added). | **PASS** |
| **D — Admin triage/moderation** (`E01-04`) | Admin login → `/requests` (`APP5-B04` queue) → detail → `APP5-B06` evidence → `APP5-B05` transitions → `APP5-B04` refetch | **Real:** everything, including the real staff login and the real private binary stream. **Fixture:** the bootstrap Admin, created by the accepted staff-bootstrap CLI exactly as APP1/APP4 runs do. | **PASS** |

`E01-06` restates the composed invariants as assertions over the collected
proofs, so a journey that silently stopped recording cannot pass.

---

## 3. Customer-owned journey (Journey A)

| Step | Evidence |
|---|---|
| Navigation entry | `/` → the approved **Đặt thêu** shell link → `/yeu-cau/moi`, with both chooser options rendered. Typed URLs are never used to reach the screen. |
| Verification | One `contact_verification_challenges` row, digest-only (`hasCodeHash`, no readable code). The code is delivered by the real worker, read from the recording adapter, typed into APP5's embedded step. Exactly **one** `customers` row exists afterwards — no account, no password, no CRM record. |
| Upload | Exactly one `POST /api/public/custom-request-intake/challenges/{id}/assets` → **202**. The asset row exists in `UPLOADED`/`INSPECTING` *before* any worker runs, and carries `uploaded_via_challenge_id` = this challenge and `uploaded_by_customer_id` = this customer — provenance written by `APP5-B02` from the locked challenge row, unreachable from the request. |
| Bindable | The inspection job (real `sharp` decode of a real JPEG, from real MinIO) moves the asset to `ACCEPTED`; the screen's own tile then reads *"Đã duyệt"*. The wait is real: before the job ran, the state was not terminal. |
| Submit | One `custom_requests` row at `NEW`, its `customer_id` the verified customer; `product_id`, `product_variant_id` and `submitted_session_id` all `NULL` and a `customer_owned_products` child present — the subject XOR as persisted. One quantity line (2). One `custom_request_assets` binding to the accepted asset with role `COP_IMAGE`. **Zero** transition rows (`G01-D05`: creation is not a move). One `ACTIVE` `secure_access_grants` row, digest-only. The submit body carried `challengeId` and no `customerId`. |
| Confirmation | `/yeu-cau/da-gui?ma=<code>` renders the approved title and the code the URL carries. The delivered verification code is absent from every browser surface afterwards. |

---

## 4. Catalog journey (Journey B)

| Fact | Evidence |
|---|---|
| Real session | `POST /api/public/design-sessions` (mode `BLANK`) → **201** on the fixture placement, from the browser, carrying `Origin` and `Sec-Fetch-Site: same-origin`. |
| Real B07 variants | The selector renders exactly the fixture's two active variants, and **none is preselected** (asserted on the DOM, not inferred). |
| Explicit selection | The customer checks one radio; the submitted `product_variant_id` is a member of the eligible set `APP5-B07` returned. |
| Session accepted | `custom_requests.submitted_session_id` equals the session actually opened, and that `design_sessions` row is now `SUBMITTED` — consumed by the submission, not merely named by it. |
| Quantity scoped | One line (3), belonging to the selected variant. |
| No cross-contamination | Journey A's request is still `NEW`, under its own customer. |

---

## 5. Secure-link journey (Journey C)

```text
#t=<token>  →  history.replaceState cleans the URL  →  POST /api/public/custom-requests/status
```

- `stripBeforeRequest`, `hashEmptyAtRequest`, `urlContainsTokenAtRequest = false`,
  `historyContainsTokenAtRequest = false`, `requestUrlContainsToken = false`;
  request body keys are exactly `['token']`.
- **B03 only.** `/api/public/secure-links/resolve` is called **zero** times and
  the status endpoint exactly **once** — no second credential exchange is
  chained in front of it.
- The grant scopes one request: the other request's code appears nowhere on the
  page.
- After settlement the token is absent from every browser surface the scanner
  reads.

---

## 6. Cross-layer reason privacy

The strongest single proof in the run, and it is direct rather than inferred:

```text
Admin sets NEEDS_CLARIFICATION with two different texts
  → B04 refetch shows both, separately labelled
  → custom_request_transitions row carries reason + customer_visible_reason
  → the customer's B03 status shows the customer-visible text
  → and contains neither the internal reason nor the moderation note
```

The internal reason, the customer-visible reason and the moderation note are
three distinct strings in this run precisely so that "the customer sees the right
one" cannot pass by coincidence.

Also asserted on the Admin side: the evidence `<img>` is a `blob:` object URL;
the binary address is the contextual `/api/admin/custom-requests/{requestId}/assets/{assetId}/content`;
and the canonical detail payload contains no `storageKey`, `storage_key`,
`bucket`, `ORIGINALS` or bucket name.

---

## 7. Minimal corrections

### 7.1 `E01_INTEGRATION_DEFECT` — the upload could not start off a secure origin

**Found:** on the Storefront's plain-HTTP origin, choosing an item photo did
nothing at all: no tile, no request, no error. The page raised
`crypto.randomUUID is not a function` inside the file-input change handler.
`crypto.randomUUID` is a **secure-context-only** API, so on any origin the
browser does not consider trustworthy — the development stack, this E2E
topology, any internal HTTP host — it is `undefined`. The throw happened before
a slot existed to attach a failure to, which is why the customer saw nothing.
On the customer-owned branch this is fatal: that branch cannot be submitted
without an accepted item photo.

No existing test could have caught it: jsdom defines `crypto.randomUUID`
regardless of secure context, so every component test passed.

**Corrected** — narrow, one feature, no API, no design, no migration:

```text
A apps/storefront/src/features/custom-request/model/upload-idempotency-key.ts
M apps/storefront/src/features/custom-request/hooks/use-request-uploads.ts   (one call site + import)
A apps/storefront/test/model/upload-idempotency-key.test.ts                  (4 cases)
```

`newUploadIdempotencyKey()` uses `crypto.randomUUID` when it exists and
otherwise builds a real v4 UUID from `crypto.getRandomValues`, which carries no
secure-context restriction. There is deliberately **no `Math.random()`
fallback**: the key is the arbiter that stops one customer action from becoming
two stored assets, so an environment with no cryptographic randomness raises
instead of silently weakening it. The unit test drives the *absence* explicitly
rather than trusting the ambient environment.

`apps/storefront/src/features/design-studio/hooks/use-studio-image.ts` calls
`crypto.randomUUID()` the same way. It is outside APP5 and outside this
checkpoint's remit, so it is **carried, not silently widened** — see §10.

### 7.2 Harness corrections (test tier only, no application code)

```text
M packages/e2e-testing/scripts/run-e2e.mjs                     (--app5-e01 mode + its environment)
M packages/e2e-testing/playwright.config.ts                    (app5-e01-chromium project)
M packages/e2e-testing/package.json                            (e2e:app5:e01)
M packages/e2e-testing/support/orchestration/config.mjs        (objectStorageEnv helper)
M packages/e2e-testing/specs/app4/support/s02-fragment-instrumentation.ts
                                                               (defaulted requestPathPattern)
A packages/e2e-testing/specs/app5/e01.acceptance.spec.ts
A packages/e2e-testing/specs/app5/support/s01-request-driver.ts
A packages/e2e-testing/specs/app5/support/a02-moderation-driver.ts
A packages/e2e-testing/support/app5/app5-fixture-universe.mjs
A packages/e2e-testing/support/app5/app5-evidence.mjs
```

Three of these are worth naming, because each is a condition no previous run
could have met:

1. **Object storage reaches the in-process worker.** The E01 runtime fills in a
   deliberately unresolvable `.invalid` endpoint; APP4's journeys never fetch an
   object, but an APP5 inspection must read the original it is judging. Passed
   only for this mode.
2. **`DESIGN_SESSION_ALLOWED_ORIGINS` is configured.** The E2E API process was
   never given one, so *no* run before this could open a Design Session at all.
3. **The run uses `*.localhost` hostnames.** Browsers attach `Sec-Fetch-*` only
   to potentially-trustworthy URLs, and `APP3-B07` refuses a session mutation
   that carries no `Sec-Fetch-Site` (IMP-D043 PO-05). On `http://embroidery.local`
   the browser sends none, so the catalog branch is unreachable there while being
   ordinary in production (HTTPS). `.localhost` is in the browser's trustworthy
   loopback set, so it stands in for the production origin without terminating
   TLS in the harness. `DESIGN_SESSION_COOKIE_SECURE=true` is set with it, for
   the reason in §10.

No application code, no API, no schema, no design artifact and no registry row
was changed by any of this.

---

## 8. Focused validation

| Command | Why | Result | Reruns |
|---|---|---|---:|
| `node scripts/run-e2e.mjs --app5-e01` (`pnpm --filter @embroidery/e2e-testing e2e:app5:e01`) | the acceptance run itself — all four journeys | **6 passed**, 44 proofs true | 9 (each failure was a real finding or a selector correction; the sequence is in §9) |
| `npx jest test/model/upload-idempotency-key.test.ts` (`apps/storefront`) | the new module the correction adds | **4 passed** | 1 |
| `npx jest test/components/custom-request-cop.test.tsx test/components/custom-request-catalog.test.tsx` (`apps/storefront`) | the two suites that exercise the changed upload hook | **28 passed** | 0 |
| `pnpm --filter storefront typecheck` | the changed Storefront source and tests | **PASS** | 0 |
| `npx tsc --noEmit` (`packages/e2e-testing`) | the new spec and drivers | **PASS** | 1 |
| `npx eslint` on the changed Storefront and harness files | the two global quality controls, scoped to the diff | **PASS** | 1 |
| `node scripts/run-e2e.mjs --app4-browser` | `s02-fragment-instrumentation.ts` is shared with APP4; its signature gained a defaulted parameter | **4 passed** — APP4 unaffected | 0 |
| `pnpm --filter storefront build`, `pnpm --filter admin build`, `pnpm --filter worker build` | environment repair (§24): the Admin build predated `APP5-A02` and the Storefront build predated the pre-E01 nav correction | built | 1 (Storefront, after the §7.1 correction) |

**Deliberately not run** (§16): `pnpm quality`, full Jest, the full Playwright
matrix, all Admin/Storefront tests, all API integration, the B01–B07 suites, DB01,
APP3/APP4/DB regression, the worker suite, SonarQube, any all-workspace
build/typecheck, and `tools/check-app3-p03.mjs`.

---

## 9. What the run actually found

Each of these was a real fact about the composition, not a flaky test:

1. The chooser radio's accessible name includes its hint sentence (the approved
   `<label>` wraps both) — the driver matches on a substring and says why.
2. The quantity *section* carries the same `aria-label` as its field's label, so
   a label lookup resolves the region; the driver addresses the control by role.
3. **APP5's step rail collides with APP4's driver**: the rail's step-2 button is
   named *"Bước 2 — Xác minh liên hệ"*, so APP4's substring match for
   *"Xác minh"* resolves two elements. Answered in the APP5 driver with an exact
   match rather than by loosening the APP4 driver, which is correct on its own
   route. A composition-only defect — neither suite could see it alone.
4. Verification does not render a "verified" notice on the forward path; the
   rail advances by itself. The run waits for step 3, which is the real state.
5. **`crypto.randomUUID` is absent off a secure origin** (§7.1) — corrected.
6. The E2E API process had no `DESIGN_SESSION_ALLOWED_ORIGINS`, so session
   mutations were refused before any allowlist decision.
7. Chrome sends **no** `Sec-Fetch-*` on a plain-HTTP `.local` origin, so
   `APP3-B07` refuses every session mutation there regardless of configuration.
8. The Design Session cookie is `__Host-` prefixed, and browsers reject a
   `__Host-` cookie that is not `Secure` — so with `DESIGN_SESSION_COOKIE_SECURE`
   false (the non-production default) the cookie is silently dropped and every
   session mutation is `SESSION_NOT_AUTHORIZED`. See §10.
9. On Windows, `*.localhost` is resolved by the browser but **not** by Node, so
   the Admin detail payload is read from inside the page rather than through a
   Node-side request context — which is also the more faithful read.

---

## 10. Open follow-ups

Carried unchanged, all nonblocking:

```text
FU-APP5-S01-STUDIO-ENTRY-01             (narrowed by the pre-E01 audit: the storefront entry
                                         exists; only the APP3 Studio "request this design"
                                         control remains, and it needs an approved frame)
FU-APP5-S02-NULLABLE-STRING-CONTRACT-01 (19 generated aliases; E01 compiled and ran against
                                         them with no integration failure — §19 satisfied)
FU-APP5-B04-DESIGN-PREVIEW-01
FU-APP5-S02-CONFIRMATION-SUMMARY-01
FU-APP5-S02-MASKED-CONTACT-01
FU-APP5-A01-FILTER-SET-CONFIRM-01
FU-APP5-A01-QUEUE-COUNT-01
FU-APP5-B01-APP3-SURFACE-GATE-01
```

Opened by this checkpoint, both **nonblocking** and both outside APP5:

```text
FU-APP5-E01-STUDIO-RANDOMUUID-01 — `use-studio-image.ts` calls `crypto.randomUUID()` for its
  own upload idempotency key, the same call APP5 just corrected. Off a secure origin the
  APP3 Studio image upload will fail the same silent way. Not corrected here: it is an APP3
  surface and widening the fix would make this checkpoint's diff cross a phase boundary.

FU-APP5-E01-HOST-COOKIE-DEV-01 — the Design Session cookie is `__Host-` prefixed
  unconditionally, while `DESIGN_SESSION_COOKIE_SECURE` defaults to false outside production.
  A `__Host-` cookie without `Secure` is rejected by every browser, so on the development
  stack (`http://embroidery.local`) the Studio's session credential is silently dropped.
  Production is unaffected (`Secure` is required and set there). Owner: APP3's cookie policy
  and the dev compose defaults; E01 worked around it by running on a trustworthy origin.
```

Neither is a defect in an APP5 deliverable and neither blocks phase closure.

---

## 11. Acceptance disposition

```text
Blocking follow-ups: None
```

All sixteen §27 criteria are met: the shell reaches `/yeu-cau/moi` (1); a
customer-owned request crosses verification → upload → inspection → submit →
confirmation (2); a catalog request uses a real B07 variant on a real APP3
session (3); the status read is B03-only with the fragment stripped (4); the
Admin queue and detail compose for that request (5); B06 evidence renders from
its request context (6); a B05 mutation persists and the B04 refetch reflects it
(7); the two reasons stay separated across the layer boundary (8); no duplicate
request or mutation appeared (9); no account, CRM or APP6 flow appeared (10); the
known design and contract debts remained truthful (11); the one integration
defect was corrected minimally (12); no broad regression was run (13); no
checkpoint was invented (14); this report exists (15); and the roadmap points at
X01 (16).

---

## 12. Files

**Added**

```text
apps/storefront/src/features/custom-request/model/upload-idempotency-key.ts
apps/storefront/test/model/upload-idempotency-key.test.ts
packages/e2e-testing/specs/app5/e01.acceptance.spec.ts
packages/e2e-testing/specs/app5/support/s01-request-driver.ts
packages/e2e-testing/specs/app5/support/a02-moderation-driver.ts
packages/e2e-testing/support/app5/app5-fixture-universe.mjs
packages/e2e-testing/support/app5/app5-evidence.mjs
docs/implementation/reports/APP5-E01-COMPLETION-REPORT.md
```

**Modified**

```text
apps/storefront/src/features/custom-request/hooks/use-request-uploads.ts   (one call site)
packages/e2e-testing/scripts/run-e2e.mjs
packages/e2e-testing/playwright.config.ts
packages/e2e-testing/package.json
packages/e2e-testing/support/orchestration/config.mjs
packages/e2e-testing/specs/app4/support/s02-fragment-instrumentation.ts
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md
docs/implementation/SCOPED_COMMAND_INDEX.md
```

Unchanged, as required: `apps/api/**`, `apps/worker/**`, `apps/admin/**`,
database migrations, `packages/contracts/openapi/**`,
`packages/api-client/src/generated/**`, and every Figma artifact and registry
row. Every runtime source file is under 400 lines and every test file under 600.

---

## 13. Roadmap

```text
APP5-E01 = COMPLETE
APP5-X01 = NEXT
```

## 14. Commit

```text
d098d67  feat(app5): accept the custom-request journeys across every delivered layer
```

Committed on `production`. Not pushed.

NEXT CHECKPOINT: APP5-X01 — Phase closure

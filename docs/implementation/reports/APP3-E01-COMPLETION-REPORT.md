# APP3-E01 — Studio cross-layer acceptance: completion report

## 1. Verdict

`APP3-E01` is **delivered**. The cross-layer journey exists, runs end to end on
the real topology, and reports what the running system does.

Its verdict on the system is **not** a clean pass, and that is the checkpoint's
output rather than a failure of it. Two complete runs produced identical results:
**52 facts held, 5 failed**, and all five failures are the same customer-visible
defect, found by putting two accepted checkpoints in the same browser for the
first time.

`APP3-X01` must not start: one finding blocks closure.

## 2. What was built

| File | Purpose |
| --- | --- |
| `tools/smoke-app3-e01.mjs` | the run: identities up, allow-list pointed, worker recreated, fixtures seeded, journeys, restore |
| `tools/smoke-app3-e01-runners.mjs` | isolated client identities by topology |
| `tools/smoke-app3-e01-journey.mjs` | the shared runtime: facts, cookie flags, gestures, save cycles |
| `tools/smoke-app3-e01-studio.mjs` | the `desktop`, `upload` and `mobile` journeys |
| `tools/smoke-app3-e01-security.mjs` | the conflict investigation, the negatives, the bypass probe |
| `tools/check-app3-e01{,.sources}.mjs` | the evidence gate |
| `tools/check-app3-e01.test.mjs` | 24 mutation tests against that gate |
| `apps/api/.../ephemeral-network-key.service.ts` | **the security fix** |
| `apps/api/.../design-session-auth.spec.ts` | its three regression tests |
| `apps/storefront/test/components/studio-autosave-retry.test.tsx` | the S10 retry timeline |
| `tools/smoke-app3-s01-fixtures.mjs`, `tools/bench-app3-s03-fixtures.mjs` | idempotent Template seeds |
| `tools/smoke-app3-s01-trustworthy-origin.mjs` | the run's origin allow-list, per run |

## 3. The security defect this checkpoint closed

`IMP-D043` PO-07 keys anonymous Session limits on an ephemeral network key. The
key was taken from the **left-most** `X-Forwarded-For` entry — the one a client
writes — while the gateway appends with `$proxy_add_x_forwarded_for`. A caller
could therefore choose its own rate bucket.

Measured before the fix: an honest caller with its burst spent got `429`; the
same caller sending `X-Forwarded-For: 198.51.100.7` got `201`.

The key is now the entry the **trusted hop appended**, empty entries cannot
choose a bucket, and the fix is defended three ways: three tests in the accepted
spec (68/68 pass), a gate rule that also asserts the gateway is still the
appending hop, and a live probe in the run itself —

```
bypass — a caller cannot choose its own rate-limit bucket
  ok  an honest caller is refused once its burst is spent — 201,201 then 429
  ok  a forged forwarded entry mints no fresh bucket — 429,429,429
```

## 4. Findings

### 4.1 `FU-APP3-UPLOAD-REVISION-SEAM-01` — BLOCKS_X01

**An image upload leaves the customer's next save in conflict.** `APP3-B06B`
advances the Session revision as part of the upload and returns the new one;
`APP3-S06` keeps it in `use-studio-image`'s local state for its own next upload
and never hands it to `APP3-S10`, whose `serverRevision` still holds the
pre-upload value. The autosave that follows is a stale write, the server refuses
it `409`, and a customer with **one tab open** is shown "Xung đột" for a conflict
with nobody. The design they were shown is then not the one that persists: after
a reload the image element renders no href at all.

Evidence: the chip reads `Xung đột` where `Đã lưu` is required; the API log
carries exactly one `"route":"/api/public/design-sessions/:sessionId/document","statusCode":409`
per upload; reproduced in both runs.

Ruled out: a second Session credential in the browser — the same failure
reproduces on a Session opened in a browser that has held no other.

Why neither checkpoint saw it: `APP3-S06` was accepted before `APP3-S10` existed,
and `APP3-S10` was accepted against an **injected** revision rather than one an
upload had really moved.

Not repaired here. The fix is a wiring change inside two accepted capability
checkpoints and needs its own tests and review; an acceptance journey that
quietly repaired the thing it was measuring would be worth nothing.

### 4.2 `FU-APP3-SESSION-CREDENTIAL-ACCUMULATION-01` — nonblocking

Declining a resume and opening a new Session leaves the previous `__Host-`
credential behind: measured **2** where 1 is intended. Each cookie is host-only,
`Secure`, `HttpOnly` and unlocks only the Session named in it, and it is not the
cause of 4.1 — so this is recorded as hygiene, not as a security hole.

### 4.3 `FU-APP3-WORKER-BOOT-ORDER-01` — nonblocking

The worker fail-fasts on Postgres `57P03` at boot and stops consuming while its
container still reports "Up". Observed: every Session upload from 05:36 sat at
`INSPECTING` for six hours. A restart drained the backlog immediately. The run
now recreates the worker before any journey depends on it.

## 5. Follow-ups disposed of

| Follow-up | Disposition |
| --- | --- |
| `FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01` | **CLOSED** — `EXPECTED_BY_STATE_MACHINE`; the fourth attempt is a second edit re-arming the ladder |
| `FU-APP3-S01-FIXTURE-IDEMPOTENCY-01` | **CLOSED** — 14 published Templates on both cycles, no manual SQL |
| `FU-APP3-S11-BENCHMARK-01` | **CLOSED** — every gesture p95 ≤ 18.2 ms at S/M/L |
| `FU-APP3-TRANSFORM-BUDGET-01` | **OPEN_WITH_EXPLICIT_ACCEPTED_PHASE_DEBT** — see §6 |
| `FU-APP3-STUDIO-TOOL-RAIL-01` | **OPEN** — audited at 1440/1024/390, gap unchanged |
| `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` | **DEFERRED_LATER_APP3** — fixtures are not an intake path |

## 6. The transform budget, measured on both engines

L = 100 elements (332 DOM nodes), p50/p95 ms per gesture frame:

| Engine | move | resize | rotate |
| --- | --- | --- | --- |
| Chromium | 16.7 / 33.4 | 16.7 / 33.3 | 16.7 / 33.4 |
| WebKit | 47 / 48 | 39 / 48 | 46 / 48 |

Both exceed the frozen `ADR-APP0-001` 20 ms p95 reference, and the phase carries
that as stated debt rather than claiming the budget met.

Attribution is the per-element React subtree at L=100 plus WebKit's whole-SVG
re-rasterisation — not a regression from any one checkpoint: `APP3-S08` measured
L=100 back to back against `APP3-S09` HEAD and found them identical, and
`APP3-S03-C1` had already isolated the cost as 100 React subtrees rather than the
geometry authority. The bisect the follow-up asked for has no interval left.

Honest limit: a rAF-sampled p95 on a 60 Hz display cannot land between 16.7 and
33.4 ms, so the Chromium tail is **one dropped frame in 3–4 of the run**, and the
true figure is somewhere in (16.7, 33.4]. The WebKit figures carry no such
ambiguity — three sustained frames with the majority dropped.

## 7. Session capacity, without any of the three shortcuts

The run needs more Session capacity than one source has. It never forges a
header, never waits out a window, and never restarts the API to clear a counter.
Each journey gets a **real** source: a forwarder container with its own assigned
address on the Compose network, published on its own loopback port, so the
gateway observes a genuinely different client and the browser still gets a
potentially trustworthy origin.

Assigned rather than left to Docker, because it was measured: three sequential
`docker run --rm` containers were handed the **same** recycled address and the
second pair inherited the first pair's exhausted bucket (`201,201,429,429`); with
explicit addresses the same three creations were `201,201,201`.

## 8. What the conflict investigation found instead

Three independent attempts to produce a stale write from the delivered Studio all
ended with the customer's save **succeeding**: a second tab, a second tab denied
focus, and a real second HTTP client that advanced the Session server-side
(`write -> 200`). `APP3-S10` performs a reconciliation read before every attempt,
so a write is never stale by the time it leaves the browser.

This is reported as the observation it is. The conflict UI is reachable only when
that read sees a *divergent* document — which is exactly what §4.1 produces.

## 9. Validation actually run

| Command | Result |
| --- | --- |
| `node tools/check-app3-e01.mjs` | PASS |
| `node --test tools/check-app3-e01.test.mjs` | 24/24 |
| `pnpm --filter @embroidery/api test -- design-session-auth` | 68/68 |
| `pnpm --filter @embroidery/storefront test -- studio-autosave-retry` | 3/3 |
| `npx prettier --check` on the changed files | PASS after `--write` |
| `node tools/smoke-app3-e01.mjs` ×2 | 52 held / 5 failed, identical both runs |

Scoped per `VALIDATION_GOVERNANCE.md` §3. No repository-wide aggregate was run
and no root script was added.

**A pre-existing failure, measured rather than assumed.** The broader
`design-session` jest pattern reports failures in
`design-session-asset-status.spec.ts` (`DesignSessionReadGuard — read limit`,
4 failed / 7 passed) and in suites needing a disposable Postgres. That is the
state at HEAD, not something this checkpoint caused: with
`ephemeral-network-key.service.ts` restored from HEAD the same suite reports the
identical **4 failed / 7 passed**, and with the fix in place it reports the same
again. The suite this change actually justifies —
`design-session-auth`, which covers the network key — is 68/68.

## 10. Disclosed deviations and limits

- **`tools/smoke-app3-e01-studio.mjs` is 559 lines and `-journey.mjs` is 480**,
  above the 450 the phase records for *checkers*. The checker and its tests are
  within their caps (366 / 316). Disclosed rather than split late in the run.
- **`smoke-app3-s01-trustworthy-origin.mjs` now takes its origin from the
  environment.** Still exactly one allow-list of exact loopback origins the run
  really uses — pointed at the truth, never widened.
- **Touch is emulated**, and says so: a 390×844 context with `hasTouch` and
  synthetic pointer contacts. No physical device was used.
- **The mobile journey proves history by undoing**, not by counting rows: `S11`
  renders no history list at 390, so a row count there would read 0 whatever the
  engine holds and would pass the negative assertions for the wrong reason.
- **Two Sessions on the `upload` identity** (a clone and a Blank); every other
  identity opens one. All within `IMP-D043` PO-07.
- The run mutates the development environment (origin allow-list, fixtures,
  worker restart) and restores all of it in `finally`, pass or fail.

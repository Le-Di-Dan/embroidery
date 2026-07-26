# APP1 — Closure Evidence

Paired evidence for the APP1 closure completion report. **Closure Commit A: `036043c1b1a4861c14977f6184d1841d8f9fc220`** (`docs(app1): close staff access and shared shells`). Branch `production`; initial HEAD before closure `84b02b3a68d04b1bde2609069556007cd6bfe0f6` (APP1-E01-C1 evidence). **Nothing pushed.** Verdict **`PASS_WITH_FOLLOW_UPS`**, `APP1_BLOCKING_FOLLOW_UP_COUNT = 0`.

## 1. Closure validation — commands and exact exits

Run from a clean tree (§12 order):

| Command | Exit | Result |
|---|---|---|
| `pnpm install` | 0 | up to date; tree clean |
| `pnpm quality` | 0 | format/lint/typecheck/all package tests/file-size/styles/figma/frontend-boundaries/check:e2e/spike-boundaries/openapi/api-client/db-manifest |
| `pnpm quality:e2e` (attempt 1) | 0 | check:e2e + 3-engine container smoke **15 passed** (no rerun needed; the FU02 WebKit 504 did not reproduce) |
| `pnpm e2e:app1` (run A) | 0 | **17 passed** |
| `pnpm e2e:app1` (run B) | 1 | 16 passed, **1 non-reproducible transient** — accepted E01 forced-expiry `loginAsAdmin` shell-render timeout under sustained host load (retries 0); routed APP1-FU03 |
| `pnpm e2e:app1` (rerun C) | 0 | **17 passed** |
| `pnpm e2e:app1` (rerun D) | 0 | **17 passed** |
| `pnpm smoke:app1-bootstrap` | 0 | **8/8** |
| `pnpm check:openapi` | 0 | artifact hash unchanged |
| `pnpm check:api-client` | 0 | generated tree up to date |
| `pnpm check:figma-design-index` | 0 | 39 registry IDs, 39 node rows, 6 tables |
| `node --test tools/check-figma-design-index.test.mjs` | 0 | pass |
| `pnpm db:check:manifest` | 0 | all checks passed |
| `node tools/check-frontend-test-boundaries.mjs` | 0 | clean |
| `node tools/check-frontend-build-boundary.mjs` | 0 | clean (2404 built files) |
| `node tools/check-api-dist-boundary.mjs` | 0 | clean (321 built files) |
| `node tools/check-file-size.mjs` | 0 | pass (only pre-existing REVIEW-threshold notes) |
| `git diff --check` | 0 | clean |

**e2e:app1 determinism:** runs A, C, D each 17/17 (two consecutive clean greens C+D); run B a single non-reproducible transient; Playwright `retries = 0` within every run. Per §12 a single non-reproducible transient is routed (APP1-FU03), not a blocker.

## 2. Test / quality baseline (fresh)

Package tests (Jest + `node --test`): API **84 suites / 937**, Admin **23 / 141**, Storefront **11 / 53**, api-client **7 / 38** (+ generated-tree node checks 7), persistence **6 / 88**, database **5 / 152**, e2e-testing unit **4 / 14**, worker **2 / 6**, test-utils **1 / 5**, contracts **1 / 9**, frontend-testing **4 / 10**; `@embroidery/styles` foundation validation PASS. APP1 host/Chromium integration: **7 specs / 17 tests** (A/C/D green). Container 3-engine smoke: **15 passed**. Compose bootstrap smoke: **8/8** (dev missing-env fail ×2, create, reuse [hash unchanged], prod skip ×2, unknown-env fail-closed, residue 0/0/0 + dev stack 6).

## 3. Contract / database / design baselines (frozen, unchanged)

- OpenAPI SHA-256 `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946`.
- Generated API-client tree SHA-256 `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f`.
- Public staff operations present: `staffSessionCreate`, `staffSessionDelete`, `staffSelfGet`.
- Database: **31 migrations**, **78 tables**, **833 physical columns**, fingerprint `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f`; `NO_APP1_SCHEMA_OR_MIGRATION_CHANGE`.
- Figma: `FIG-APPROVAL-APP1-D01-ADMIN-001` (13 Admin rows) + `FIG-APPROVAL-APP1-D02-STOREFRONT-001` (7 Storefront rows) `APPROVED_FOR_IMPLEMENTATION`; Homepage shell rows `SUPERSEDED`; `FIG-STOREFRONT-NOTFOUND` `APPROVED_FOR_IMPLEMENTATION`; registry check pass (39 IDs, 27 approved, 6 superseded).

## 4. Security / cleanup

`APP1_SECRET_SCAN = PASS` — no password, raw cookie value, session token/hash, credential hash/salt, credentialed database URL, real personal email, user-facing stack trace, or temporary secret env in source, reports, E2E fixtures, or build output; fixtures are `*.example.test`. Post-validation residue: **0** APP1 test containers / **0** networks / **0** volumes; normal `embroidery-dev` project **6 containers** unchanged; no leftover `test-results`/`playwright-report`/traces/videos/screenshots/env files. `git diff --check` clean; working tree clean after Commit A.

## 5. Checkpoint / commit chain (full hashes)

16 delivery checkpoints, each impl/decision + evidence commit (from `git log`, all local on `production`, unpushed):

audit `dad1b6587d34fea88fea1a64dd8b8dd9a2ff0fb8` / `6c472e03b1f5ae9c8b4e564c6ba96801ec47c630`; DEC-AUTH `741dadd18bf2cebf7ab50ef4231e63c2f5855a9b` / `061c00cc33eb9864713495b267f577188603f12a`; D01 `ca611a9ff6672091dce9695b065e654d441e489e` / `c721ae5a84c3f3cce41a5ba89040e722efeadf7e`; B01 `1eeb7f322b2c6662afdd2ce69a2b8fc1aaf4301a` / `08a70e9279d0e27c1225c9a753f09b78ed12dbaf`; B01-C1 `1724905c8a697ecad3fc4b30f7d059836990e085` / `c3f7026d63d652734926c934eb3ccb24bc82219f`; B02 `66e2854183ddba8b701360e1f3ee97ea08ee18cf` / `c99c9f4e69ae057cf2f8ed0755ba5c9091fd9f20`; B02-C1 `673f1dff39b735e5c184e520d24098088895aba2` / `be52c084b757b3b9dd60e34b573f139e74634e0c`; A01 `27e57e3535fb2732c2b580bad59d8de7ac8dc4aa` / `930d0cd28df0559b59abcbbfc304967d7ff05649`; A01-C1 `9aabbf066fef05e6b7c222645f3f30f053e09c1c` / `2145137101353df82bee79c85068a08480950262`; A01-C2 `32a7854490e79a75c7cdc71c43ce9070cfa4a2b3` / `9f01083c0cbc1e25b54a2899f0aa76658b99911c`; A02 `67fd9f60b6989dcaa6a57eaf1c86f9a8b18b878f` / `9310940c4346ab37a0e5f851642768b10d26ef9b`; D02 `eb57ad2548d120819e11b81970f7f3c412d48121` / `f4f336a0f4602fbde5af7bd556dc664ec4b0f285`; S01A `0b11fbb0d2202cb4fe477b8fc26408079f67ed8d` / `ae6206b3fb4efd0734c5aadc20823aeef146d182`; S01B `f45821b546a883f818763ad3f1279913cdb09b5a` / `063b0dbca23a24047f238cca5846172b6161b796`; E01 `3b4f31e3df8cd08e61a192ba9af085d027d9c7e6` / `75d0971a1ecfe3dff5cf75aec6554b382175114f`; E01-C1 `8d247b4ce104e1df33338f1593f141a727586ef8` / `84b02b3a68d04b1bde2609069556007cd6bfe0f6`. Closure Commit A `036043c1b1a4861c14977f6184d1841d8f9fc220`; this evidence file is the paired Closure Commit B.

## 6. Acceptance matrix

All 39 §25 criteria satisfied (see the completion report §N). Highlights: complete chain verified with paired evidence; A01/A02/D02/S01 PO-accepted; E01/E01-C1 review-accepted; capability/design/contract/DB baselines frozen; OpenAPI + client hashes exact; DB 31/78/833/fingerprint exact with no drift; `quality` PASS; `quality:e2e` PASS (first attempt); `e2e:app1` two consecutive clean greens (C, D) with retries 0; bootstrap 8/8; boundaries pass; secret scan PASS; zero isolated residue; dev stack untouched; every deviation reconciled with an owner; blocking count 0; FU01/FU02/FU03 routed nonblocking; APP2 handoff precise; APP2 not started; Commit A docs-only; this evidence docs-only; report ≤360 lines (121); exactly two closure commits; tree clean; not pushed.

## 7. Scope confirmation

This closure changed no implementation source, test, Figma artifact, schema, migration, generated file, or dependency. Commit A added the completion report and reconciled status pointers (roadmap, traceability, phase plan, README); this Commit B adds only this evidence file.

## 8. Final status

**`APP1 = COMPLETE — PASS_WITH_FOLLOW_UPS`** · **`APP1-X01 = COMPLETE`** · **`APP2 = NOT_STARTED`**. Milestone **R0 achieved** (APP0 + APP1; production readiness remains APP12 per IMP-D015). Working tree clean; not pushed.

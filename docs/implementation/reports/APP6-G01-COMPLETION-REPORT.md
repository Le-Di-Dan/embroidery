# APP6-G01 — Design Review, Approval and Quotation Authority — Completion Report

## 1. Verdict

```text
APP6-G01 = COMPLETE
APP6 AUTHORITY = LOCKED
NEXT CHECKPOINT = APP6-DB01

DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS
TRUE_PO_DECISION     = none
```

This checkpoint changed documentation, one authority-owned policy dataset and
three repository tools. No runtime application code, no schema, no migration, no
OpenAPI artifact, no generated client, no Figma node.

Artifacts:

- ADR — [`../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md`](../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md)
- Authority package — [`../audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md`](../audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md)
- Decision — `IMP-D051`

---

## 2. Preflight

```text
branch          production
entry HEAD      0da79ae  docs(app6): record the R00 commit hash in its completion report
working tree    1 unrelated pre-existing change, preserved untouched:
                ` D beginning_app_development_with_flutter_by_rap_payne.pdf`
R00 commit      c7d0b9b  reachable (git merge-base --is-ancestor → true)
APP6-R00        COMPLETE, accepted by the Product Owner
APP6-G01        INCOMPLETE / NEXT at entry
```

The deleted Flutter PDF is unrelated to APP6 and was left exactly as found.
Nothing was reset, stashed, discarded, amended or pushed.

---

## 3. Authority sources

Every source read is listed in the authority package §2. The ones that decided
something here:

```text
ADR-DB3-001 (DEC-16)              Option A ordering; rules 1–8
ADR-DB3-003                       post-approval revision is a new version
ADR-DB3-004 r1, r4, r9            single REQUEST_ACCESS scope; sensitive set; revoke-wins
DB3_LIFECYCLE_SPECIFICATIONS      LC-08, LC-11, LC-12 rows
DB3_TRANSITION_GUARD_CATALOG      GRD-002…GRD-008
DB3_CONCURRENCY_SPECIFICATION     CC-02…CC-06, CC-16
DB3_IDEMPOTENCY_SPECIFICATION     quotation.accept, design.approve
DB3_SIDE_EFFECT_OUTBOX_CATALOG    SE-004, SE-005, SE-015
DB3_AGREEMENT_ACCEPTANCE_SPEC     GRD-008 semantics; the baseline required type set
04 BR-005, 12 D-013/D-014         40 % / 60 %
01 §2.1                           the four policy pages
schema + package + API source     physical truth (report §5, §6)
```

No source conflict was found, so no precedence rule had to be applied and no
accepted source is superseded by this checkpoint.

---

## 4. Product Owner rulings reconciliation

| Ruling | Disposition | Evidence |
|---|---|---|
| PO-G01-01 COP is a real branch | `APPLIED` | ADR §3.1–§3.2; INV-13; TBL-038's own table comment |
| PO-G01-02 COP geometry is the frozen formal-version envelope | `APPLIED` | ADR §3.3; `customer_owned_products.physical_*_mm` are nullable and describe the item |
| PO-G01-03 truthful COP snapshot evidence | `APPLIED`, with one narrow persisted field pair | ADR §3.6–§3.7; `product_name`/`side_name`/`area_name` are already frozen text (COL-TBL031-06), never FKs |
| PO-G01-04 effective expiry independent of the sweep | `APPLIED`; the equality convention **confirmed**, not assumed | `now >= expiresAt` is the delivered convention in `submit-verification-attempt.use-case.ts:148`, `read-verification-challenge-status.query.ts:57`, `challenge-intake.authorizer.ts:128` |
| PO-G01-05 minimal approval agreement set | **`SUPERSEDED_BY_STRONGER_EXISTING_AUTHORITY`** for the type set; `APPLIED` as the content floor | `DB3_AGREEMENT_ACCEPTANCE_SPEC.md` §2.1 already locks the required set as policy config with a payment + return baseline. The prompt itself directs preserving an accepted set |
| PO-G01-06 quotation validity | `APPLIED` — the fallback, because no accepted duration exists (`DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md` and `DB5_ARCHIVE_RETENTION_INDEXING.md` both record the window as `[cfg]`) | authority §6.1 |
| PO-G01-07 deposit 40 % is policy handoff only | `APPLIED`, with one clarification | `quotation_versions.deposit_percent`/`deposit_amount`/`remaining_amount` are `NOT NULL` pricing columns under CST-064, so APP6 writes the **split**; it creates no Order, obligation, attempt or collection |
| PO-G01-08 client-side review rendering | `APPLIED` | authority §8 |
| PO-G01-09 reuse `REQUEST_ACCESS` | `APPLIED` | `GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']` is a closed single-value set |
| PO-G01-10 system projection rule | `APPLIED` | authority §4.1 |

---

## 5. COP ADR

`ADR-APP6-001` — Accepted.

**Two branches.** Catalog: the complete placement quartet, no
`customer_owned_product_id`, existing placement authority unchanged. COP:
`customer_owned_product_id`, the four Catalog columns `NULL`, never fabricated
and never borrowed. The branch is decided once at version creation from whether
the request has a `customer_owned_products` row (CST-027 makes that at most
one), and is never mixed or switched.

**Geometry.** Catalog validates against Catalog placement authority. COP
validates containment against the formal version's frozen positive
`physical_width_mm`/`physical_height_mm` **placement envelope** — never against
the nullable `customer_owned_products.physical_*_mm`, which describe the item
and would claim the whole garment as the stitch area.
`packages/design-engine` takes its authority as an argument and imports no
schema, so no engine change is required; `validatePlacementSnapshot`'s Catalog
identity reconciliation simply does not run on the COP branch.

**Freeze.** At `TR-LC08-02` the branch identity, placement context and geometry
become immutable. A change is a new version (`TR-LC08-01` + `TR-LC08-05`),
never an edit; post-approval revision follows ADR-DB3-003.

**Snapshot.** `product_name` from `customer_owned_products.name`,
`variant_label` `NULL`, `side_name`/`area_name` from the frozen agreed
placement labels, plus the exact version and document hash, the frozen
envelope, the agreement versions, the grant and step-up evidence and the
thread-colour evidence. No fake Catalog label is written.

**APP7 handoff.** The approved COP snapshot alone is sufficient for order
conversion — `order_items` already accepts the COP branch through its nullable
`customer_owned_product_id`. APP6 implements no part of APP7.

### 5.1 Three findings the ADR had to absorb

1. `design_sessions` declares product/side/area `NOT NULL`, so **a COP request
   has no Design Session at all**. COP digitizing authors a document from
   customer evidence, not from a cloned Studio session.
2. `DesignPlacementSnapshot` declares `productSideId` and `embroideryAreaId` as
   required non-empty strings, enforced in
   `packages/design-document/src/validation/structure.ts`. A COP document
   cannot honestly populate them either. Ruled in ADR §3.4 — absence is `null`,
   no existing document's bytes/canonical form/hash may change, and the
   widening rides the delivered `SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS`
   mechanism rather than a silent relaxation of version 1. **Routed to
   `APP6-B08`**; it is a package change, not a schema change, and is not part
   of the DB01 contract.
3. `production_specifications.side_name`/`area_name` are `NOT NULL` downstream,
   so COP placement labels are load-bearing, not decorative — which is what
   makes the one field-pair addition necessary rather than convenient.

---

## 6. DB01 handoff

```text
DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS
```

Exactly eight authorised schema operations (ADR §4):

```text
design_versions      1  four Catalog placement columns → nullable
                     2  + nullable customer_owned_product_id, FK RESTRICT
                     3  + nullable placement_side_label, placement_area_label
                     4  + CHECK exactly-one-branch
                     5  + CHECK COP-branch label completeness

approval_snapshots   6  the same four columns → nullable
                     7  + nullable customer_owned_product_id, FK RESTRICT
                     8  + CHECK exactly-one-branch
```

**The only additional fields, justified individually.**
`design_versions.placement_side_label` and `placement_area_label` are the sole
fields for which existing persistence cannot preserve required immutable human
evidence: `approval_snapshots.side_name`/`area_name` are `NOT NULL` and
`production_specifications` requires them downstream; the COP branch has no FK
to read them through; `customer_owned_products` holds only `name` and
`description` — the item, not the placement; and the labels must be frozen with
the geometry they describe, on the same row, or the approval transaction would
invent them at approval time. Every other snapshot fact is branch-independent
or already nullable.

Also locked in ADR §4.1–§4.2: the exact `CHECK` shapes (a **partial** Catalog
quartet is rejected by both branches), `ON DELETE RESTRICT`, branch
completeness, **no** index or uniqueness change, **no** partial-unique change,
**no** backfill (every existing row is already a valid Catalog row and
nullability is only widened), forward-only migration safety, and the honest
reversibility limit.

`APP6-G01` wrote no SQL and edited no schema file.

---

## 7. Agreement authority

| Item | Ruling |
|---|---|
| Required types | `[PAYMENT_POLICY, RETURN_POLICY]` — preserving the `DB3_AGREEMENT_ACCEPTANCE_SPEC` §2.1 baseline, as policy configuration (CON-144). `agreements.agreement_type` deliberately carries no `CHECK`, so this is data |
| Effective version | Derived: `PUBLISHED`, inside its effective window, not superseded or withdrawn. Exactly one per type at any instant |
| What the customer sees | `APP6-B10` returns the effective version — id, type and content hash — **in the same read as the exact design version** |
| What approval binds | `APP6-B11` submits the exact `agreementVersionId` set plus each content hash; GRD-008 verifies in transaction that the submitted set equals the current required set, each version is still effective and each hash matches; any mismatch is `TERMS_NOT_ACCEPTED` and the client re-reads |
| Snapshot | `approval_snapshot_agreement_acceptances`: version id + frozen type + content hash + timestamp per type; CST-091 makes it immutable |
| Later publication | Never mutates historical evidence; withdrawn versions are retained while referenced (ADR-DB1-011); re-consent only through a new approval event (ADR-DB3-003) |
| Quotation acceptance | Requires no separate terms acceptance — one ceremony at approval |
| Content | Product-Owner-supplied. **No APP6 checkpoint invents legal text.** If no PO content exists when it is needed, `APP6-B10` publishes only the PO-G01-05 workflow consent and nothing else |
| Publication owner | **`APP6-B10`** — no publication path is delivered today; this follows the APP4 precedent exactly (`APP4-G01` shipped the dataset, `APP4-B01-C1` the reader and publisher). It adds no HTTP operation |

---

## 8. Quotation authority

```text
validity duration   7 calendar days                    (no accepted value existed; window is [cfg])
send-time origin    the committed send instant of TR-LC12-02, timestamptz
effective expiry    now >= valid_until, evaluated in transaction; the sweep is never the arbiter
deposit             40 % / 60 %, policy authority only — no Order, obligation, attempt or collection
exact money         numeric(14,2) → string → string → string → string → UI; no JS float authority
```

CST-064 remains the arbiter of the split and the totals; `currency_code` is
`'VND'` by `CHECK`. Every new APP6 nullable-string OpenAPI property is declared
`@ApiProperty({ type: String, nullable: true })`, so APP6 adds none of the debt
`FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` records.

Values ship as **data only** in
`packages/database/seed/app6-policy-configuration.seed.json`, on the delivered
`policy_configurations` / `policy_configuration_versions` infrastructure. No new
policy system. Reader and publisher are `APP6-B01`.

---

## 9. Lifecycle projection table

| Transition | Actor | Owning use case | Guard | Transaction | Event | Commandable? |
|---|---|---|---|---|---|---|
| `TR-LC11-05` `UNDER_REVIEW → QUOTED` | **system** | quotation send, `APP6-B03` | totals valid; validity set; version frozen | the send transaction | `SE-004 quotation.sent` | **No** |
| `TR-LC11-06` `QUOTED → QUOTE_ACCEPTED` | **system** | quotation accept, `APP6-B05` | GRD-002/003/**006** | the acceptance transaction | none required | **No** |
| `TR-LC11-07` `QUOTE_ACCEPTED → DIGITIZING` | **admin** | request transition, `APP6-B06` | **GRD-005**, no override | its own transaction on the request row | none | **Yes — the only one** |
| `TR-LC11-08` `DIGITIZING → DESIGN_REVIEW` | **system** | send for review, `APP6-B09` | **GRD-004**; canonicalize + hash | the send transaction | `SE-004 design.review-ready` | **No** |
| `TR-LC11-09` `DESIGN_REVIEW → APPROVED` | **system** | approval, `APP6-B11` | GRD-002/003/**007**/**008** | the approval transaction | `SE-005 design.approved` | **No** |

Full precondition, audit-evidence and error-mapping columns: authority §4.

**The rule (§4.1).** The four `system` targets are reachable **only** as a
projection of the owning aggregate's committed event, inside that event's own
transaction. No sync-state API, no generic set-state use case, no
admin-selectable target. `APP6-B06` widens the delivered `APP5-B05` endpoint's
application-layer allow-list by exactly one target and publishes no new
operation.

---

## 10. Idempotency table

Confirmed from `DB3_IDEMPOTENCY_SPECIFICATION.md`, not replaced. No new
infrastructure.

| Action | Namespace | Scope | Fingerprint | Replay |
|---|---|---|---|---|
| Quotation acceptance | `quotation.accept` | the exact quotation version | version id + accepted total | the existing acceptance evidence |
| Design approval | `design.approve` | the exact design version | version id + document hash + terms version | the existing Approval Snapshot |

| Other action | Disposition |
|---|---|
| Revision request | Natural — one decision per version; a second loses to CC-04 → `INVALID_TRANSITION` |
| Quotation reject | Natural — the terminal version state is the record |
| Send-for-review duplicate / concurrency | Natural — arbitrated by `uq_design_versions__case__sent_for_review`; resend replays, a second version's send → `REVIEW_ALREADY_ACTIVE` |
| Quotation send duplicate / concurrency | Natural — `TR-LC12-02` records "resend replays"; a `SENT` version is not re-frozen, re-priced, or re-pointed |

---

## 11. Concurrency and error table

| Scenario | DB arbiter | In-transaction behaviour | Public error | Proof owner |
|---|---|---|---|---|
| CC-03 simultaneous send-for-review | partial unique index | constraint failure; GRD-004 | `REVIEW_ALREADY_ACTIVE` | `APP6-B09` |
| CC-02 approval vs superseding version | design version row | `FOR UPDATE` + state check; GRD-007 | `APPROVAL_VERSION_MISMATCH` | `APP6-B11` |
| CC-04 approval vs revision request | design version row | `FOR UPDATE`; first decision wins | `INVALID_TRANSITION`, naming the first decision | `APP6-B11` |
| CC-05 stale quotation acceptance | quotation version row | `FOR UPDATE` + state/current-pointer check; GRD-006 | `QUOTE_VERSION_STALE` | `APP6-B05` |
| CC-06 expiry vs acceptance | quotation version row | `FOR UPDATE`; `now >= valid_until` in transaction | `QUOTE_VERSION_STALE` | `APP6-B05` |
| CC-16 grant revoke vs sensitive action | grant row | status re-read inside the action transaction; committed revoke wins | `SECURE_LINK_UNAVAILABLE` | `APP6-B05`, `APP6-B11` |
| Duplicate quotation acceptance | idempotency claim | claim before write | replay, not an error | `APP6-B05` |
| Duplicate design approval | idempotency claim | claim before write | replay, not an error | `APP6-B11` |
| Digitizing without acceptance | request row | `FOR UPDATE` + GRD-005 | `QUOTE_NOT_ACCEPTED` | `APP6-B06` |
| Request-state race from a design/quotation event | request row | contended inside the owning transaction | `INVALID_TRANSITION` | `B03`, `B05`, `B09`, `B11` |

`REVIEW_ALREADY_ACTIVE` is the only one already present in
`DB7_ERROR_MAPPING_CATALOG.md`; the rest carry their DB3 guard names and each
owning checkpoint publishes the code exactly as named, never a synonym.

---

## 12. Secure access

`REQUEST_ACCESS` is reused unchanged — `GRANT_SCOPE_KINDS` is a closed
single-value set (ADR-DB3-004 r1). **No** new grant kind, **no** new token
format, **no** customer account, **no** second secret architecture.

Sensitive writes (quotation acceptance and design approval, both on the
ADR-DB3-004 r4 locked set) re-check inside their own transaction: grant status
and expiry (CC-16), scope and request-target ownership (INV-08), step-up
freshness, and exact-version eligibility (GRD-006 / GRD-007). Rejection and
revision-request are grant-scoped but not step-up actions, per TR-LC12-06 and
TR-LC08-03.

Customer identity is **derived from the grant**; no client-supplied
`customerId` is ever authority. Admin identity is server-derived. The token
travels in a POST body, never a query string, path, history entry or log. The
fragment is stripped before any request. Every grant-validity failure — read or
write — answers with the delivered non-enumerating `SECURE_LINK_UNAVAILABLE`;
`REVERIFICATION_REQUIRED` is returned only when the grant is valid and step-up
alone is missing.

---

## 13. Rendering

```text
safe formal design document → APP3 native-SVG renderer (IMP-D026) → APP3-S09 watermark → review UI
```

**No APP6 server raster pipeline is authorized.** `preview_derivative_id` and
`preview_hash` may stay `NULL`; both are already nullable. No export or
download path, no generic private-asset endpoint, no storage key, bucket or
provider URL in any response. Reversible — a derivative can be added later
without remodelling.

Proof owners: `APP6-B10` (safe secure review read), `APP6-S02` (render +
watermark + no export), `APP6-E01` (focused acceptance).

---

## 14. Events

| Event | Required | Owning transaction | Consumer | Boundary |
|---|---|---|---|---|
| `quotation.sent` (SE-004) | yes | `TR-LC12-02` | APP4 notification worker | amounts OK, no document content |
| `design.review-ready` (SE-004) | yes | `TR-LC08-02` | APP4 notification worker | no document content |
| `design.revision-requested` (SE-004) | yes | `TR-LC08-03` | Admin surface | — |
| `design.approved` (SE-005) | yes | `TR-LC08-04` | **APP7** order-creation trigger + confirmation | **APP6 emits and stops** — no Order, obligation or payment |
| `quotation.accepted` | **no** | — | — | not in SE-004; not created for symmetry |
| `quotation.rejected` | **no** as an outbox event | — | — | not in SE-004; admin alert only |
| `SE-015` quote-expiry sweep | out of APP6 scope | — | — | correctness never depends on it |

External notification provider selection remains deferred (IMP-O006 → APP12).

---

## 15. Dataset changes

```text
A  packages/database/seed/app6-policy-configuration.seed.json
```

Three keys — `quotation.validity`, `quotation.deposit`,
`design_approval.agreements` — **data only**, no reader and no publisher, on
the `APP4-G01` precedent. `containsSecrets: false`; every value is a business
number or an enumeration, and no secret-bearing name appears (asserted by the
gate).

Focused validation: `node tools/check-app6-g01.mjs`, which reconciles every
dataset value against the ADR fact table in **both** directions.

---

## 16. Validation ledger

| Command / check | Changed input / question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain` | Baseline | `production` @ `0da79ae`; one unrelated deleted PDF | 0 | Direct repository state |
| `git merge-base --is-ancestor c7d0b9b HEAD` | Is the R00 commit reachable? | yes | 0 | Definitive |
| Source read: `design-versions.ts`, `approval-snapshots.ts`, `customer-owned-products.ts`, `design-sessions.ts`, `order-items.ts`, `production-specifications.ts`, `quotation-versions.ts`, `agreements.ts`, `policy-configurations.ts`, `secure-access-grants.ts` | What does persistence actually allow? | §5, §6 | 0 | Schema source is the authority on nullability and on closed sets |
| Source read: `packages/design-document/src/schema/document.ts`, `validation/structure.ts`, `schema/constants.ts`; `packages/design-engine/src/placement/authority.ts`, `containment/area.ts` | Can a COP document and a COP geometry check be expressed honestly today? | No — finding §5.1.2, ruled in ADR §3.4 | 0 | The type and its validator are the contract |
| Source read: `publish-app4-policy.use-case.ts`, `app4-policy-dataset.ts`, `app4-policy-configuration.seed.json` | What is the delivered policy-dataset convention, and what did `APP4-G01` itself ship? | Dataset at G01; reader and publisher at B01-C1 | 0 | The delivered precedent settles the split |
| `grep` for the delivered expiry comparison across `apps/api/src` | Does an accepted boundary convention exist for PO-G01-04? | Yes — `now >= expiresAt`, three call sites | 0 | Delivered code beats a fallback |
| Targeted `grep` over `docs/database/DB3_*`, `docs/adr/database/ADR-DB3-*`, `docs/04`, `docs/12`, `docs/01` | Guards, races, idempotency, side effects, agreement baseline, deposit, policy pages | §7–§14 | 0 | Locked accepted authority |
| `ls packages/database/migrations/*.sql \| wc -l` | Did anything write SQL? | 35 — unchanged | 0 | Committed directory |
| `node -e` count over the committed OpenAPI artifact | Did anything publish an operation? | 58 / 63 / 132 — unchanged | 0 | Reads the artifact; **no generation run** |
| `grep -c APP_06 docs/design/FIGMA_DESIGN_INDEX.md` | Did anything touch Figma? | 0 | 0 | The registry is canonical |
| **`node tools/check-app6-g01.mjs`** | Do the ADR, the dataset, the register, the authority package and the phase roadmap agree, and did the checkpoint stay inside its scope? | **OK** (after two fixes, §17) | 1 | The only focused checker governing the changed authority-owned inputs; it recomputes every fact from the file that owns it |
| **`node --test tools/check-app6-g01.test.mjs`** | Does the gate actually reject? | **16/16 pass** — 15 distinct mutations refused, HEAD accepted | 0 | A gate that only says yes is not a gate |
| `git diff --check` | Whitespace damage | clean | 0 | Direct |

**Reruns.** `check-app6-g01.mjs` ran twice: the first run failed on two of its
own rules, both fixed in the checker rather than by weakening an assertion
(§17), and the second run passed. No other command was rerun on unchanged
inputs.

Explicitly **not run**, and not needed:

```text
no broad regression          no pnpm quality / quality:e2e
no runtime suite             no Jest, Vitest or Playwright
no OpenAPI generation        no generated-client generation
no all-workspace typecheck   no build
no SonarQube                 no APP3 historical gate sweep
no APP4/APP5 acceptance      no repository-wide aggregate
no Figma mutation            no DB migration
```

---

## 17. Two checker findings, and what they proved

The gate's first run failed on two of its own rules, and both were worth
recording rather than quietly patching.

1. **`apps/api/src/modules/quotation` already exists.** The negation "no APP6
   quotation runtime module" was simply wrong: `APP6-R00` §4 had already
   established that `QuotationModule` is composed with its repository and
   mapper. The rule was corrected to assert what must still be absent — the
   **application** and **HTTP** layers, plus the dataset reader and the policy
   publisher `APP6-B01` owns. A negation stated against the wrong baseline
   fails loudly on day one and passes silently forever after someone relaxes
   it.
2. **A prose needle spanned a markdown emphasis marker.** The ADR reads *"They
   are **not** copied from"*; the checker looked for `not copied from` and
   never found it. The needle was narrowed to the part that carries the
   meaning. No assertion was dropped.

---

## 18. Files changed

| File | Classification |
|---|---|
| `docs/adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md` | **A** — accepted ADR |
| `docs/implementation/audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md` | **A** — authority package |
| `docs/implementation/reports/APP6-G01-COMPLETION-REPORT.md` | **A** — this report |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | **M** — `IMP-D051` added once |
| `docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md` | **M** — roadmap status + §11.3 locked-authority summary |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | **M** — `CMD-CHECK-APP6-G01`, `CMD-TEST-APP6-G01` |
| `packages/database/seed/app6-policy-configuration.seed.json` | **A** — authority-owned policy dataset, data only |
| `tools/check-app6-g01.mjs` | **A** — checkpoint gate |
| `tools/check-app6-g01-authority.mjs` | **A** — gate constants and readers |
| `tools/check-app6-g01.test.mjs` | **A** — gate mutation tests |

No runtime application source, no schema file, no migration, no generated
artifact, no Figma node, no registry row, no root `package.json` script.

---

## 19. Roadmap update

Written to
[`../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md`](../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md)
§11.1, with the locked-authority summary in §11.3.

| Checkpoint | Status | Note |
|---|---|---|
| `APP6-R00` | `COMPLETE` | Phase-entry audit |
| `APP6-G01` | `COMPLETE` | APP6 authority locked |
| `APP6-DB01` | `INCOMPLETE` | **Next** — COP design-context forward migration |
| `APP6-D01` | `INCOMPLETE` | APP6 Figma package |
| `APP6-B01` | `INCOMPLETE` | Quotation drafting — 2 operations; also the policy dataset reader and publisher |
| `APP6-B02` | `INCOMPLETE` | Quotation read — 2 operations |
| `APP6-B03` | `INCOMPLETE` | Quotation send — 1 operation; projects `TR-LC11-05` |
| `APP6-B04` | `INCOMPLETE` | Customer secure quotation read — 1 operation |
| `APP6-B05` | `INCOMPLETE` | Quotation acceptance and rejection — 2 operations; projects `TR-LC11-06` |
| `APP6-B06` | `INCOMPLETE` | Digitizing transition — 0 new operations |
| `APP6-B07` | `INCOMPLETE` | Admin submitted-design read — 1 operation |
| `APP6-B08` | `INCOMPLETE` | Design version authoring — 2 operations; also the `design-document` COP placement widening |
| `APP6-B09` | `INCOMPLETE` | Send version for review — 1 operation; projects `TR-LC11-08` |
| `APP6-B10` | `INCOMPLETE` | Customer secure review read — 1 operation; also agreement content publication |
| `APP6-B11` | `INCOMPLETE` | Approval and revision request — 2 operations; projects `TR-LC11-09` |
| `APP6-A01` | `INCOMPLETE` | Admin quotation workbench |
| `APP6-A02` | `INCOMPLETE` | Admin design-case workbench |
| `APP6-S01` | `INCOMPLETE` | Customer secure quotation screen |
| `APP6-S02` | `INCOMPLETE` | Customer secure design review screen |
| `APP6-E01` | `INCOMPLETE` | Focused cross-layer acceptance |
| `APP6-X01` | `INCOMPLETE` | Phase closure |

Every remaining row from `APP6-R00` is preserved; three carry an added
ownership note and nothing was removed or reordered.

---

## 20. Work routed to later checkpoints

| Item | Owner | Why not here |
|---|---|---|
| `packages/design-document` COP placement widening (ADR §3.4) | `APP6-B08` | Runtime package change; forbidden at an authority checkpoint |
| APP6 policy dataset reader + publisher | `APP6-B01` | Runtime code; the `APP4-B01-C1` precedent |
| Agreement content authoring + publication | `APP6-B10` | Needs an Admin-bearing path; content is Product-Owner-supplied |
| The eight schema operations | `APP6-DB01` | Dedicated database-change checkpoint (`08-DATABASE-CHANGE-CONTROL`) |
| `TR-LC12-05` / `SE-015` expiry sweep | later phase | Deferred at R00; correctness never depends on it |

---

## 21. Commits

```text
docs(app6): lock the APP6 design review, approval and quotation authority
```

Documentation, one authority-owned dataset and three repository tools. Nothing
pushed. The commit hash is recorded here after the commit is created, following
the established convention.

```text
fc1a346  docs(app6): lock the APP6 design review, approval and quotation authority
```

---

## 22. Next checkpoint

```text
NEXT CHECKPOINT: APP6-DB01 — COP design context
```

Not executed. The Product Owner reviews this report before authorizing it.

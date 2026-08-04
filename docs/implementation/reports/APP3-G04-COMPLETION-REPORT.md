# APP3-G04 — Completion report

**Checkpoint.** `APP3-G04` — Editor-safe media, asset eligibility and complexity
authority.

**Branch.** `production`. Entry `HEAD` = `9d9f2525acce1d5ec979517dafcd2596cf7c1a13`
(`docs(governance): record root script correction`).

**Delivered under.** The manual intervention directive for the failed first
attempt. This is the human resolution of that failure, not a second attempt at
the original ruling and not an ordinary correction.

**Status.** `APP3-G04 = COMPLETE — REVIEW_DELIVERED`. Human review owns
`REVIEW_ACCEPTED`.

---

## 1. The first attempt, and its disposition

The first `APP3-G04` execution stopped at
`APP3-G04 = FAILED — MANUAL INTERVENTION REQUIRED`, as its own PO-12 instructed:
*"Before recording `G04_DB_CONTRIBUTION = NONE`, mechanically inspect the real
schema. If an intrinsic dimension or required classification field is absent,
stop."*

It changed no file, created no commit and pushed nothing; the working tree was
clean at `9d9f252` when it stopped. Nothing from that attempt needed reverting,
so this checkpoint starts from the same tree the previous one ended on.

The stop was correct. Recording the ruling as issued would have written a false
measurement into a machine-checked fact table — the one failure mode these gates
exist to prevent.

## 2. The human decision

Selected: **A — canonical derivative metadata columns**, owned by
`asset_derivatives`.

Rejected: **B — `asset_inspections.detail` V2 as runtime authority.**

The rejection is recorded in `IMP-D044` PO-12 and asserted mechanically, not
merely stated: the fact `Inspection detail runtime authority = NEVER` and the
decision-row claim *"never runtime state authority"* are both gated, and a test
proves the gate refuses a repository that changes either.

Inspection JSON remains evidence and may inform a later controlled backfill. It
is never the runtime authority for derivative dimensions, media type or byte
size.

## 3. Measured evidence

Taken from the Drizzle source **and** the migrated development database before
any file was edited.

### 3.1 Schema

| Measured | Result |
|---|---|
| `asset_derivatives` columns (live `\d`) | `id, asset_id, kind, status, storage_key, checksum, is_watermarked, created_at, updated_at` |
| derivative width / height / media-type / byte-size column | **absent**, in both source and database |
| every `width\|height\|mime\|media_type\|size\|dimension` column in `public` | 23 rows; not one is an asset- or derivative-level pixel dimension |
| `assets.mime_type`, `assets.size_bytes` | present — **source binary** metadata |
| `product_sides.image_width_px/image_height_px`, `px_per_mm` | present — store-authored **placement geometry** |
| `asset_inspections.detail` | nullable `text`, append-only; V1 JSON carries source and derivative dimensions |
| inspection decoder accepted kinds | exactly `THUMBNAIL` and `CATALOG_PREVIEW`; `mediaType` fixed to the literal `image/webp`; a spec asserts `kinds.has('NORMALIZED') === false` |
| inspection detail read paths | `decodeInspectionDetail` is used only by the worker's terminal-replay check and its specs; no API module reads it |
| editor-safe derivative producer | none exists — `DERIVATIVE_OUTPUT_POLICIES` emits `THUMBNAIL` and `CATALOG_PREVIEW` only |
| derivative kinds | `PREVIEW_WATERMARKED, MOCKUP, NORMALIZED, THUMBNAIL, CATALOG_PREVIEW` |

### 3.2 The four categories, kept distinct

The directive required these never be treated as interchangeable, and they are
not:

| Category | Where it lives | What it describes |
|---|---|---|
| **Source Asset metadata** | `assets.mime_type`, `assets.size_bytes`, `assets.checksum` | the uploaded binary |
| **Derivative canonical metadata** | `asset_derivatives.width_px/height_px/media_type/byte_size` — **does not exist yet**, added by `APP3-DB01` | the generated output of that exact row |
| **Inspection-history evidence** | `asset_inspections.detail` (append-only V1 JSON) | what one completed inspection observed |
| **Placement geometry** | `product_sides.image_*_px`, `physical_*_mm`, `px_per_mm`; `embroidery_areas.bound_*` | store-authored canvas↔physical mapping |

### 3.3 Existing-data measurement (read-only)

Development database, migrated. Nothing mutated. Development data is not
production authority.

| Measure | Result |
|---|---|
| assets | 1 — `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` / `ACCEPTED`, `image/jpeg` |
| `asset_derivatives` | `CATALOG_PREVIEW` READY ×1, `THUMBNAIL` READY ×1 |
| **`NORMALIZED` derivatives** | **0** |
| `PREVIEW_WATERMARKED` / `MOCKUP` | 0 / 0 |
| `asset_inspections` | 1 `ACCEPTED`; recorded kinds `["THUMBNAIL","CATALOG_PREVIEW"]`, widths `[480, 700]` |
| `design_template_assets` / `design_session_assets` | 0 / 0 |
| `product_sides`, and with a background | 0 / 0 |
| `design_sessions` | 0 |
| `product_media` | 2 |

Exact statements run: `\d asset_derivatives`; a column sweep over
`information_schema.columns`; grouped counts over `assets`,
`asset_derivatives`, `asset_inspections`; a `unnest`-driven per-kind count; and
`jsonb_path_query_array(detail::jsonb, '$.derivatives[*].kind')`. Every one is
`SELECT`-only.

**Consequence:** no grandfathering is required. No editor-safe derivative exists
whose metadata would have to be reconstructed.

## 4. The twelve rulings

Recorded verbatim in `IMP-D044` and in phase plan §6.7.2.

- **PO-01 — canonical editor-safe derivative.** `NORMALIZED` is reused as the
  sole editor-safe kind; `EDITOR_SAFE`, `STUDIO_PREVIEW`, `DESIGN_PREVIEW` and
  `SESSION_PREVIEW` are not authorized. `PREVIEW_WATERMARKED` and
  `CATALOG_PREVIEW` are never Studio source. Kind alone never grants access.
- **PO-02 — profiles without a database enum.** `SIDE_BACKGROUND`,
  `TEMPLATE_ASSET`, `SESSION_UPLOAD` are processing-policy identifiers, never a
  persisted enum or column.
- **PO-03 — side background.** `CATALOG_MEDIA` lane,
  `product_sides.background_asset_id`, JPEG/PNG/WebP, **SVG rejected**;
  delivered by `APP3-B02` only through published Product + active Side context.
- **PO-04 — Template asset.** Admin only, `TEMPLATE_SOURCE`,
  JPEG/PNG/WebP/**SVG** after mandatory server-side sanitization against a named
  restriction set; the sanitized derivative is self-contained and the original
  SVG never reaches the Studio.
- **PO-05 — anonymous Session upload.** Valid IMP-D043 credential,
  `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE`, raster only, **SVG rejected in APP3**;
  private, session-owned, never promoted to shared media.
- **PO-06 — delivery boundaries.** Exactly three delivery classes; no generic
  `GET /assets/:id`; no storage key or original URL in a response;
  Session-private delivery is `private, no-store` and re-authenticates every
  request; no `secure_access_grants` change.
- **PO-07 — intrinsic dimensions.** `width_px`, `height_px`, `media_type`,
  `byte_size` are mandatory before a document may reference a derivative; raster
  from the inspected decoded image, SVG from a bounded `viewBox`; never guessed.
- **PO-08 — upload limits.** 10 MiB raster; 4096 × 4096 px; 16,777,216 decoded
  pixels per asset; 1 MiB Admin SVG; 10,000 sanitized nodes; 1,000,000 path
  characters. Compressed size never overrides the decoded-pixel limit.
- **PO-09 — document limits.** 512 KiB; 100 elements; 20 image; 80 text; 20
  unique assets; depth 8; 500 characters per text element; 5,000 total;
  33,554,432 decoded pixels across unique referenced image assets. Server-side,
  no partial save, no silent increase.
- **PO-10 — fonts.** Server-owned `fontId` against a versioned registry
  delivered by `APP3-P01`; no remote, embedded or user-supplied font; unknown id
  fails validation; fonts do not consume the 20-asset budget.
- **PO-11 — watermark separation.** Never in the derivative bytes, never
  serialized, no export or download surface.
- **PO-12 — canonical derivative metadata and database contribution.**
  *(Replacement.)* See §5.

## 5. Database contribution

```text
G01_DB_DISPOSITION = REQUIRES_APP3_DB01_PLACEMENT_RETIREMENT_AND_STABLE_CODE
G02_DB_CONTRIBUTION = NONE
G03_DB_CONTRIBUTION = NONE
G04_DB_CONTRIBUTION = REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA

APP3-DB01 = REQUIRED — READY_FOR_EXECUTION
```

`APP3-DB01` now owns exactly two contribution groups: (1) Product Side /
Embroidery Area retirement, replacement and stable-code authority from
`APP3-G01`; (2) canonical derivative metadata on `asset_derivatives` from
`APP3-G04`.

`G01_DB_DISPOSITION` is **relabelled, not changed**. §6.4.1 still records
`REQUIRES_APP3_DB01` and `check-app3-g01.mjs` still asserts that exact string;
the longer name in §10 exists only to distinguish the two groups. G01's scope is
untouched.

### 5.1 The locked schema contract

`APP3-DB01` adds to `asset_derivatives`, with repository-native types chosen
after inspecting existing conventions:

| Column | Semantics when present |
|---|---|
| `width_px` | positive integer |
| `height_px` | positive integer |
| `media_type` | non-empty canonical MIME type |
| `byte_size` | positive integer/bigint |

Plus an **all-or-none** invariant (all four null or all four non-null) and
positive-value checks on the non-null case.

Not added: `inspection_detail_id`, `current_inspection_id`, a profile enum
column, an editor derivative kind, a public-asset flag, a grant-purpose column.
No index is required for these four columns unless `APP3-DB01` measures an
access path that needs one.

### 5.2 Why nullable rather than `NOT NULL`

Five reasons, all recorded in §6.7.3: existing `THUMBNAIL`/`CATALOG_PREVIEW`
rows may hold no canonical metadata; no editor-safe row exists yet; a migration
must not call object storage; historical rows without deterministic metadata
must stay representable; and missing metadata must make a derivative
**ineligible rather than fabricated**. The all-or-none check is what keeps
"nullable" from meaning "partially populated".

### 5.3 READY eligibility contract

A derivative is Studio-eligible only when **all** hold: `status = READY`; kind
is the editor-safe one; `width_px` and `height_px` present and positive;
`media_type` present and approved for the processing profile; `byte_size`
present and positive; inspection, source-lane and profile rules pass; and
contextual owner/association rules pass.

A row may be created before processing with the quartet null. The transition to
READY persists the quartet **atomically** with the completed state. The Studio
never infers dimensions, and document validation never reads object storage on a
Template or Session document write.

### 5.4 Backfill policy

`APP3-DB01` adds the nullable quartet and its checks, leaves historical rows
null where no deterministic value exists, never fabricates a value, never parses
arbitrary inspection history as runtime authority, and is not blocked by old
non-Studio derivatives lacking metadata. A later bounded backfill may populate a
historical row **only** from deterministically provable object metadata or exact
inspection evidence linked to that derivative. It is not required for APP3
entry.

## 6. Public-media dimensions follow-up

```text
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — AUTHORITY_LOCKED_BY_APP3-G04
FINAL_OWNER = APP3-B02
BLOCKED_BY  = APP3-DB01 + APP3-B06
```

Deliberately **not** closed here. `APP3-G04` locks the authority; `APP3-DB01`
adds the fields; `APP3-B06` and the worker write canonical metadata for new
editor-safe derivatives; `APP3-B02` exposes side-background dimensions through
the contextual public contract and closes it after integration evidence passes.
Claiming closure now would claim a schema and a delivery contract that do not
exist.

## 7. Inherited checker repair

`FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01` = **`COMPLETE — CLOSED_BY_APP3-G04`**.

`check-app3-g02.mjs` bounded §6.5.4 with the literal end marker `## 7. `. It now
uses `sectionBody()`, which ends a section at the next Markdown heading of equal
or higher level. `boundedTable()` keeps its signature and delegates row parsing
to a new `tableRows()`, so `check-app3-g03.mjs` — which imports `boundedTable` —
is unaffected. No other G02 behaviour changed.

**A measured detail worth recording.** The retired bound was in practice ended
not by §7 but by the sentence in §6.6.4 that *quotes* the marker inside
backticks. So the block already stopped before §6.6.4, and no wrong value was
ever produced — the gate was correct by accident of where its own disclosure
note sat. A test now pins this: moving that sentence must not move the bound.

Five focused cases added (31/31 pass):

- §6.5.4 reads only its own table — no `### 6.6`, no `UNBLOCKED_BY_G03`;
- the bound stops at an equal-level and at a higher-level heading, and does
  **not** stop at a deeper one;
- with two later dependency tables carrying duplicate ids, `sectionBody` returns
  G02's value while the retired literal bound returns the last duplicate;
- the bound does not depend on the prose `## 7. ` mention;
- a real regression inside §6.5.4 is still refused.

## 8. Gate behaviour

`node tools/check-app3-g04.mjs`, with `tools/check-app3-g04-media.mjs` owning
the profile, delivery, limit, font and watermark half. The split exists because
one file would exceed the 400-line source limit, and because the two halves fail
for different reasons — one when prose is softened, the other when the schema
moves.

The gate verifies the **pair** (recorded contribution, real schema) and accepts
two consistent worlds:

| Repository state | Result |
|---|---|
| four columns absent, contribution `REQUIRES_…`, `APP3-DB01` = `REQUIRED — READY_FOR_EXECUTION` | `PASS — REQUIRED_SCHEMA_CONTRIBUTION_PENDING` |
| four columns present with all-or-none and positive checks, `APP3-DB01` recorded delivered | `PASS — DERIVATIVE_METADATA_IMPLEMENTED` |

Refused as contradictions: only some columns present; a contribution of `NONE`
beside absent columns (the exact false premise that failed the first attempt);
`APP3-DB01` claiming completion while no column exists; a contribution still
pending after the columns land; columns without their constraints; a forbidden
column beside the quartet; inspection JSON or source-asset metadata declared the
dimension authority; metadata made optional or guessable; the editor-safe kind
missing or a new editor kind introduced.

It does **not** demand the columns stay absent. A gate that did would have to be
deleted the day the migration lands, which is how authority checks quietly stop
being run.

Also asserted: `IMP-D044` exists exactly once, is `LOCKED`, records all twelve
rulings and carries the metadata contract in its own row; the §6.7.1 facts and
§6.7.4 dependency rows; the derivative enum; source-metadata and
placement-geometry columns still present; the append-only `detail` column still
present; the security document carrying the same intake, delivery and limit
boundary; **no APP3 asset operation in the committed OpenAPI**; and the full
`APP3-G03 → G02 → G01` chain as a regression.

## 9. Test matrix

`node --test tools/check-app3-g04.test.mjs` — **38/38 pass**.

| Group | Cases |
|---|---|
| Baseline | repository passes in pending mode; every fact and dependency row present; §6.7.4 keys disjoint from the §6.6.4 keys G03 asserts |
| Derivative kind | non-reused kind; each of the four forbidden enum values; reused kind removed; watermarked/catalog/original made eligible; profile promoted to a DB enum or column |
| Intake lanes | SVG or wider sources on the side background; Template SVG without mandatory sanitization; anonymous Session accepting SVG (fact **and** security document); Session upload made public or shared; generic public asset endpoint; staff auth for Storefront delivery |
| Dimensions and limits | optional/guessed dimensions; SVG attributes without `viewBox`; inspection history or source metadata as authority; **all 16 upload and document limits changed, one at a time**; a limit removed from the security document; partial save; silent increase; client-side enforcement |
| Fonts and watermark | remote / user-uploaded / Template-embedded font; `fontFamily` instead of `fontId`; unknown-id silent fallback; serialized or baked watermark; export surface enabled |
| Authority | decision missing, duplicated, unlocked, missing a ruling, or dropping the metadata contract; APP3 asset operation in OpenAPI; source-metadata and placement-geometry columns lost; `detail` column lost; follow-up falsely closed or reopened; predecessor regression propagates |
| Schema modes | passes in implemented mode; half the columns; columns without constraints; `NONE` beside absent columns; `APP3-DB01` complete with no columns; contribution pending after columns land; forbidden column beside the quartet |

The suite builds **one** throwaway root and restores files between cases rather
than copying `.git` per case — the naive harness took minutes for a suite nobody
would then run.

## 10. Scoped validation

Run, and why:

| Command | Result | Why in scope |
|---|---|---|
| `node tools/check-app3-g04.mjs` | **PASS — REQUIRED_SCHEMA_CONTRIBUTION_PENDING** | created here |
| `node --test tools/check-app3-g04.test.mjs` | **38/38 pass** | created here |
| `node tools/check-app3-g02.mjs` | **PASS** | the shared phase file changed and the bound defect is fixed here |
| `node --test tools/check-app3-g02.test.mjs` | **31/31 pass** | same |
| `node tools/check-app3-g01.mjs` | **PASS** | the shared phase authority file changed |
| `node tools/check-app3-g03.mjs` | **PASS** | same |
| `pnpm format:check` | **PASS** — all files | global control |
| `pnpm lint` | **PASS** — 21/21 workspaces | global control |
| `git diff --check` | **clean** | whitespace |

No `pnpm quality`. No root test, E2E, smoke, OpenAPI generation, DB manifest,
Figma or full-regression run. Nothing sent to background; nothing polled.

`tools/check-app3-g04-media.test.mjs` was **not** created — the media half is
exercised through the orchestrator's own suite, and a second file would have
duplicated the fixture without adding a case.

### 10.1 File sizes (touched tool files only)

| File | Lines | Limit |
|---|---|---|
| `tools/check-app3-g04.mjs` | 399 | 400 |
| `tools/check-app3-g04-media.mjs` | 224 | 400 |
| `tools/check-app3-g04.test.mjs` | 576 | 600 |
| `tools/check-app3-g02.mjs` | 386 | 400 |
| `tools/check-app3-g02.test.mjs` | 378 | 600 |

## 11. Changed files

Commit A — `c18543125ab29b4c79b2f7af4344c0a639184c14`
(`docs(app3): lock editor media metadata authority`), 13 files:

| File | Change |
|---|---|
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | new §6.7 (facts, twelve rulings, DB contribution, dependency reconciliation, measured evidence); §6.3 open decisions closed or routed; §6.6.4 disclosure note closed; §10 status |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-D044` |
| `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` | §4 intake lanes and source limits; §5 delivery classes and eligibility; §7 document complexity and font mechanics |
| `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` | §3 the bound the IMP-D026 budgets assume; §5 derivative metadata integrity |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP3 = fourth gate delivered; G04 summary |
| `docs/implementation/13-PHASE-SOURCE-MAP.md` | IMP-D044 as APP3 authority; the measured absence that produced it |
| `docs/implementation/audits/APP3_PRE_IMPLEMENTATION_AUDIT.md` | §M security positions closed; §N follow-up routing; §checkpoint-map G04 row; a forward note on the dimensions finding |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | new §3.1 |
| `tools/check-app3-g04.mjs`, `tools/check-app3-g04-media.mjs`, `tools/check-app3-g04.test.mjs` | new |
| `tools/check-app3-g02.mjs`, `tools/check-app3-g02.test.mjs` | bound repair + 5 cases |

No historical completion report was rewritten. Dated records carry forward
supersession notes.

### 11.1 Command index entries

`docs/implementation/SCOPED_COMMAND_INDEX.md` §3.1 — a new subsection, because
these commands were never root aliases and the `Former root alias` column would
have to be filled with a fiction. `CMD-CHECK-APP3-G04` and `CMD-TEST-APP3-G04`
were required.

**Disclosed addition beyond the directive:** the same subsection also indexes
`CMD-CHECK-APP3-G01`, `CMD-CHECK-APP3-G02`, `CMD-TEST-APP3-G02`,
`CMD-CHECK-APP3-G03` and `CMD-TEST-APP3-G03`. `GOV-Q01` removed those aliases
one commit *before* the index existed, so the `GOV-Q01-C1` sweep of 71 rows
never saw them and they have been undiscoverable since. The §3 count of 71
removed aliases is untouched. If the reviewer wants this narrower, the five rows
are separable from the two required ones.

No root `package.json` script was added. Root stays at 30 scripts.

## 12. Disclosures

- **`FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` = `OPEN`.** `check-app3-g03.mjs`
  has the same defect just repaired in G02: it bounds §6.6.4 with a literal
  `## 7.`, so it reads §6.7.4 as well, and a repeated `id :: portion` key would
  silently overwrite a status it asserts. `tools/` outside the G02 and G04 gates
  is outside this checkpoint's allowed files, so §6.7.4's portion labels carry a
  `post-G04` suffix to keep the two key sets disjoint, a test asserts that
  disjointness, and the defect is disclosed rather than edited. The repair is
  the same three-line change made to G02.
- **`FU-APP3-G03-QUALITY-AGGREGATE-01` = `DEFERRED — REGRESSION_ACTIVITY_ONLY`**,
  per §1 of the directive. Not run here.
- The `G01_DB_DISPOSITION` relabel in §10 versus §6.4.1 is intentional and
  explained in §6.7.3; changing §6.4.1 would break `check-app3-g01.mjs`, which
  is not in this checkpoint's allowed files.

## 13. Confirmations

- **No implementation.** No application source, package, worker, schema,
  migration, OpenAPI artifact, generated client, Figma node, `docs/design/**`
  file, infrastructure file, dependency or lockfile changed. Every forbidden
  path was read-only evidence.
- **No root script.** `package.json` untouched.
- **`APP3-DB01` not executed.** Its contract is recorded, its migration is not
  written.
- **Clean tree** after Commit B.
- **Nothing pushed.** `origin/production` remains `8b5f3b0`.

## 14. Final statuses

```text
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_ACCEPTED
APP3-G03 = COMPLETE — REVIEW_ACCEPTED
APP3-G04 = COMPLETE — REVIEW_DELIVERED

APP3 = IN PROGRESS — FOURTH GATE DELIVERED_FOR_REVIEW

G01_DB_DISPOSITION = REQUIRES_APP3_DB01_PLACEMENT_RETIREMENT_AND_STABLE_CODE
G02_DB_CONTRIBUTION = NONE
G03_DB_CONTRIBUTION = NONE
G04_DB_CONTRIBUTION = REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA

APP3-DB01 = REQUIRED — READY_FOR_EXECUTION

FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — AUTHORITY_LOCKED_BY_APP3-G04
FINAL_OWNER = APP3-B02
BLOCKED_BY = APP3-DB01 + APP3-B06

FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01 = COMPLETE — CLOSED_BY_APP3-G04
FU-APP3-G03-QUALITY-AGGREGATE-01 = DEFERRED — REGRESSION_ACTIVITY_ONLY
FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01 = OPEN
```

Human review owns `APP3-G04 = COMPLETE — REVIEW_ACCEPTED`.

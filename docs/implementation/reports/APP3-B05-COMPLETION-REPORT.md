# APP3-B05 — public published Design Template reads

`STATUS = COMPLETE — REVIEW_DELIVERED`
`COMMIT_A = 1895226 feat(api): add public Design Template reads`

## 1. Entry state

Recorded before any edit, from the working tree at `6d532f4`.

```text
branch     = production
clean tree = yes

APP3-B03  = COMPLETE — REVIEW_ACCEPTED
APP3-B03A = COMPLETE — REVIEW_ACCEPTED
APP3-B04  = COMPLETE — REVIEW_ACCEPTED   (Commit A f17a280)
APP3-B05  = READY — NOT STARTED

APP3-B04A = READY — NOT STARTED
APP3-D01  = READY — NOT STARTED
APP3-B06C = READY — NOT STARTED

FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED
```

Entry surface, measured from the committed artifact rather than read from prose:

| | value |
|---|---|
| paths | 29 |
| operations | 34 |
| schemas | 76 |
| migrations | 34 |
| root scripts | 30 |
| `openapi.generated.json` SHA-256 | `f8a14fedde8f855742efe6b7e54218720df4d099544f664a7c55a3b57ac1d526` |
| generated client tree SHA-256 | `2ead0316b3a2b5ccecbb588b5a17ff5fd2272700a29fbe645dc4d824897ce433` |

The client tree hash matches the value the accepted `APP3-B04` report records.
The OpenAPI digest is not in that report; it was measured here and matches the
`OPENAPI_SHA256_AFTER_B04` constant `check-app3-b01n-artifacts.mjs` froze, which
is the same fact from an independent source.

## 2. Exact operations

Two, and only two.

```text
GET /api/public/design-templates          publicDesignTemplate_list
GET /api/public/design-templates/{slug}   publicDesignTemplate_detail
```

The operation-id convention was confirmed mechanically rather than assumed: every
`operationId` in the committed artifact is `<domain>_<verb>`, and the two public
Catalog reads that this surface is modelled on are `publicProduct_list` and
`publicProduct_detail`.

Both are anonymous `GET`s. Neither takes a staff session, a Design Session
cookie, an Origin allowlist or a storage credential. Guards are opt-in per
controller in this codebase, so "public" is the *absence* of a decorator — and
that absence is asserted from source and from the published `security` field, so
one cannot be added by accident.

Byte delivery is not here and is not a third operation: `APP3-B05A` owns
published Template asset delivery under its own authorization proof, and §6.24.2
keeps this checkpoint at two JSON reads for exactly that reason.

## 3. Compatibility contract

`IMP-D042` PO-06 makes APP3 Templates **area-scoped**, so compatibility is exact
triple equality:

```text
productId + productSideId + embroideryAreaId
```

All three are **required** on the list. This is the one contract decision worth
arguing, so the reasoning is stated plainly: there is no product-wide, side-wide
or wildcard match to fall back to, so a partial triple has no meaning this
endpoint could honour — every available interpretation matches more Templates
than the caller asked for. Requiring all three refuses that request at the
boundary instead of silently broadening the query, keeps the ordering
well defined, keeps eligibility one bounded resolution per request rather than
one per row, and leaves no shape of this request that enumerates the store's
published Templates.

The query schema is `.strict()`, so `?status=DRAFT`, `?includeArchived=true`,
`?all=true`, `?search=`, `?sort=`, `?offset=` and `?page=` are each a 400 rather
than a silently ignored field. There is no lifecycle parameter to reject in the
first place — a public caller never chooses visibility.

In SQL the triple is three `eq` predicates on three columns. There is no
null-tolerant branch, so an unscoped Template can never enter a scoped read.

## 4. The list, and pagination

Ordered `created_at DESC, id DESC` — the same keyset the Admin list uses, for the
same reason DB5 chose keyset for every launch-critical list: an offset page
drifts under a concurrent publish and the caller sees a Template twice or misses
one entirely. Over-fetching by one answers "is there a next page" without a
second `COUNT`.

The cursor reuses the canonical codec from `@embroidery/persistence` and adds the
one thing that codec has no field for: **the scope it was issued under**. A
keyset cursor is a position in *an ordering*, and the ordering of "published
Templates for this Area" is a different sequence for every triple; replaying a
cursor from one against another skips or repeats rows silently. So the whole
triple travels inside the cursor and a mismatch is refused.

Every cursor failure — bad base64, bad JSON, wrong field count, unparseable
timestamp, empty tie-breaker, foreign scope — produces one
`PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID`. A malformed cursor is **never** treated
as "start from the beginning": a caller paging through an Area's Templates would
silently restart and reprocess all of them, having been told nothing.

The cursor is decoded **before** eligibility is resolved, and refused even for an
ineligible scope. Otherwise which of two identical requests errored would depend
on the Product's publication state, and a caller could probe that state by
watching the difference.

No `offset`, `page`, `total` or `totalCount` is offered or returned.

## 5. The detail

Resolved by normalized slug, validated against a bounded pattern before it
reaches a `WHERE` clause. The published slug policy is the one `APP3-B03` already
owns (`TEMPLATE_SLUG_MAX_LENGTH = 80`, lowercase alphanumeric groups joined by
single hyphens); the acceptance pattern is stated in Design's own policy file
rather than imported from Catalog's `product-slug.ts`, which is Catalog **domain**
and would be the cross-module coupling `CLAUDE.md` §5 forbids.

The response carries the selected published immutable version and its document,
exactly as published. Nothing is re-canonicalized on the way out: a published
version is immutable, and a read that "fixed" a document would answer with
something the store never approved.

## 6. Visibility

Two facts, both in the predicate:

```text
header status = PUBLISHED
AND the Template holds a version whose published_at IS NOT NULL
```

Neither alone is sufficient, and that is the point. A historical publication
stamp on a version can never make a `DRAFT` or `ARCHIVED` header public, and a
`PUBLISHED` header whose versions were never published shows nothing at all.

Proved live across the full cycle, driven through the real `APP3-B03`/`B03A`/`B04`
HTTP surfaces rather than hand-written SQL:

| state | visible |
|---|---|
| `DRAFT`, no version | no |
| `DRAFT`, holding an unpublished version | no |
| `PUBLISHED` | **yes** |
| unpublished (version keeps its `published_at`) | no |
| republished | **yes** |
| `ARCHIVED` | no |

Each step asserts list membership and detail reachability **together**, so a
Template can never be reachable by address while absent from the page it belongs
to. After archive, the row and its published version both still exist —
retirement, never a delete.

## 7. Published-version selection

The version shown is the **highest whose `published_at` is set**. The header's
`current_version` is never consulted, and the adapter contains no reference to
it.

This is the rule that would have stayed green while being wrong. In every state
the delivered lifecycle can reach the two agree — `APP3-B03A` saves only while
`DRAFT`, `APP3-B04` publishes only from `DRAFT`, so `current_version` cannot
advance while `PUBLISHED`. A public read must not lean on that agreement: a row
written before the lifecycle existed, restored from a backup or repaired by hand
must not be able to publish a version nobody published.

Proved live:

| case | selected |
|---|---|
| first publish v1 | v1 |
| publish v1 → unpublish → republish same v1 | v1, original stamp |
| publish v1 → unpublish → save v2, not published | nothing — header is `DRAFT` |
| publish v1 → unpublish → save v2 → publish | v2 |
| v1 and v2 both stamped | v2; v1 retained, not selected |
| `ARCHIVED` header with published history | nothing |

And the case that needed a real table: a **hand-written version 9 with
`published_at` null**, with `current_version` forced to 9 on a `PUBLISHED`
header. The read answers v1 and the leaked document does not appear. A read keyed
on `current_version` would have served it.

`loadPublished` was deliberately **not** reused. It is the clone path's read and
selects the version named by `current_version`; it is accidentally right today
and would be silently wrong here.

## 8. Current scope eligibility

A `PUBLISHED` Template reaches that state under `GRD-T01`, which proves at that
moment that its Product, Side and Area form an active chain. Nothing keeps that
true. The Product can be unpublished or moved out of a public category; the Side
or Area can be retired — none of which touches the Template, because `IMP-D041`
PO-07 retires without deleting so existing references still resolve.

So eligibility is re-asked of Catalog on **every** request, through one bounded
query, and never written back. A read that repaired the Template's status would
mutate store data from an anonymous request, and would be wrong the moment the
Product was republished — the Template was never at fault.

Ownership stays where it belongs. `findPublicPlacement` answers the same question
for a whole Product but is keyed by its public slug, which a caller holding only
ids cannot supply, so the port gained one narrow provider-only method:

```ts
findPublicPlacementScope(reference): Promise<PlacementScopeReference | undefined>
```

One statement, every condition in the same `WHERE`, joined through the chain
itself — so a Side of another Product and an Area of another Side of the *same*
Product both fail on the join rather than on a comparison someone could forget to
write. The Product-publication and public-category predicates are the same two
`findPublicPlacement` carries; Design never restates them, and the gate asserts
that it does not.

The list **omits** an ineligible scope (empty page, not an error); the detail
answers the same 404 as every other hidden state.

Proved live: unpublishing the Product hides its Templates, and a digest of the
Template's status, counter, timestamps and version counts is byte-identical
before and after. Republishing the Product brings them back. The same holds for
archiving the category and for retiring the Side or the Area.

## 9. Projection and the P01 document

The detail's `document` resolves to `#/components/schemas/DesignDocument` — the
component `APP3-P01` publishes. There is exactly one structural definition of a
Design Document in this repository and nothing in this checkpoint restates a
field of it.

The list carries **no** document. The picker chooses between Templates and does
not paint them, so the documents of a hundred Templates are a payload nobody
asked for — and once a list carries them, the cheapest way to keep it fast
becomes truncating the document, which is a different contract wearing the same
field name.

Published fields: `slug`, `name`, optional `description`, the `scope` triple, and
`publishedVersion` (`version`, `documentSchemaVersion`, `publishedAt`). The
detail adds `document`, and nothing else.

Deliberately withheld: `previewDerivativeId` and every other derivative id,
storage key, bucket and object URL; `templateId`; `status`; `createdAt`,
`updatedAt`, `archivedAt`; every Admin-only and internal field, Audit reason,
actor and Outbox payload.

## 10. `APP3-B05A` handoff

No `APP3-B05A` address is invented. Its route is still
`TO_BE_LOCKED_AT_APP3-B05A_ENTRY_AUDIT`, so publishing a derivative id here would
hand out an identifier a client could do nothing with except guess at a path —
and `IMP-D044` PO-06 forbids a generic asset-by-id read precisely so that guess
never works.

What `APP3-B05A` inherits is the pair it authorizes from: a **published Template**
(by slug) and a **published Version** (by number), both now resolvable through a
real read. A raw `assetId` is not a delivery grant and nothing here makes it one.
Asset ids appear only where they always did — inside the P01 document's own image
nodes, which is the document's structure, not a new field this checkpoint added.

`FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED`
is carried forward unchanged. It was nonblocking for B05 and remains open; this
checkpoint creates, normalizes and delivers no Asset.

## 11. Security and the read-only guarantee

Both operations are anonymous. No `DRAFT`/`ARCHIVED` inventory, Admin actor,
audit reason, private Asset metadata, unpublished version or storage detail
reaches the wire.

The error vocabulary has **two** codes and the absence of a third *is* the
non-disclosure rule:

```text
PUBLIC_DESIGN_TEMPLATE_NOT_FOUND        404
PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID   400
```

Unknown slug, `DRAFT`, `ARCHIVED`, unpublished, never-published and
derived-ineligible all produce the first, with an identical code and message —
proved live by comparing the bodies of an unknown slug, a draft and an archived
Template. No message interpolates a slug, an id, a status or a column name.

Read-only is **structural**, not conventional. The public module binds
`PUBLISHED_DESIGN_TEMPLATE_REPOSITORY`, a port on which every method is a read;
`publishVersion`, `archive`, `saveDraftVersion` and `attachAsset` are not
reachable from this surface at all. It composes no `AuditModule`,
`IdentityModule`, `AssetModule` or `ObjectStorageModule`, so there is nothing to
append an audit row or an outbox event with and nothing to reach bytes with. The
adapter contains no `insert`, `update`, `delete`, transaction or `FOR UPDATE`.

Proved live rather than asserted: a whole-schema digest — row counts for
templates, versions, template assets, audit events, outbox events and sessions,
plus md5 aggregates over every Template's status/counter/timestamps and every
version's publication stamp — is identical before and after three rounds of every
public read, including 404s.

Cache is `no-store` on both operations, the canonical value every public read in
this system already answers with. It matters more here than anywhere else: a
Template's visibility is revocable, an unpublish or archive takes effect on the
next read, and there is no cache-invalidation consumer anywhere in this system,
so any stored copy would keep a withdrawn Template visible for as long as it
lived. `ENGINEERING_JUDGMENT` is not recorded for this, because the value was
already canonical (`PUBLIC_CATALOG_CACHE_CONTROL`,
`PUBLIC_PLACEMENT_CACHE_CONTROL`, `PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL`).

## 12. Evidence

Every command below was run on the implementation commit's tree, after
formatting, so nothing here predates a change it is supposed to cover.

| command | result |
|---|---|
| `node tools/check-app3-b05.mjs` | exit 0 |
| `node --test tools/check-app3-b05.test.mjs` | **61/61** |
| `pnpm --filter @embroidery/api exec jest src/modules/design/[a-z-]+\.spec\.ts` | **244/244**, 8 suites |
| `pnpm --filter @embroidery/api exec jest test/integration/public-design-template.integration.spec` | **17/17** live PostgreSQL |
| `node --test tools/check-app3-b04.test.mjs` | 40/40 |
| `node --test tools/check-app3-b03a.test.mjs` | 40/40 |
| `node --test tools/check-app3-b03.test.mjs` | 34/34 |
| gate sweep `b05 b04 b03a b03 g01 g02 g04 db01 p01 p03 b01 b01n b02` | all exit 0 |
| `pnpm --filter @embroidery/api openapi:check` | up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date, tree `87951f1b…c1b5` |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | exit 0 |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit` | exit 0 |
| `pnpm --filter @embroidery/api exec nest build` | exit 0 |
| `pnpm --filter @embroidery/api-client exec jest` | 44/44 |
| `pnpm lint` | 24/24 packages |
| `pnpm format:check` | clean |
| `git diff --check` | clean |

The full command ledger, with fingerprints and rerun eligibility, is
`.git/app3-b05-finish-state.md`.

Not run, deliberately: `pnpm quality` (deleted by GOV-Q01), the full API suite,
the repository-wide integration sweep, and the worker, frontend, E2E and Figma
suites. No changed file is shared with any of them — the one Catalog file this
checkpoint touches gained a new method and changed none.

## 13. Surface arithmetic

```text
entry  29 paths / 34 operations / 76 schemas
B05    +2 paths / +2 operations / +5 schemas
exit   31 paths / 36 operations / 81 schemas
```

The five components are `PublicDesignTemplateListResponse`,
`PublicDesignTemplateSummaryResponse`, `PublicDesignTemplateDetailResponse`,
`PublicDesignTemplateScopeResponse` and `PublicDesignTemplateVersionResponse`.
`DesignDocument` is **not** among them — the detail references the component
`APP3-P01` already publishes.

Frozen for this world:

```text
openapi.generated.json SHA-256
  = 972490ac5e47e81640cefecf6d5d84b29ade6908dd7a6b41dabd7be27086c18b
generated client tree SHA-256
  = 87951f1b521c02ae411f553c10e8806514496d1cf41a4cb1326608e0c096c1b5

migrations   = 34 (unchanged)
root scripts = 30 (unchanged)
```

Generation ran once. There were no retries.

Every historical world and hash is preserved. `check-app3-b01n-artifacts.mjs`
gained an `APP3-B05` world **beside** the nine that were already there; not one
existing constant was edited, so a rollback to any earlier phase state is still
checked against what that state actually published.

## 14. Checker and gate evolution

New: `tools/check-app3-b05.mjs` (`CMD-CHECK-APP3-B05`) and
`tools/check-app3-b05.test.mjs` (`CMD-TEST-APP3-B05`), plus
`CMD-TEST-APP3-B05-API` and `CMD-TEST-APP3-B05-INTEGRATION`, all four indexed in
`SCOPED_COMMAND_INDEX.md`. The checker is independent of this report and never
reads it.

The 61 regressions each break exactly one ruled property in a throwaway copy of
the repository. They independently break the public header predicate, the
published-version predicate, the highest-version ordering, exact scope equality
on each of the three columns separately, each current-scope-eligibility
predicate, the safe-hiding rule, the read-only guarantee and the operation count.

**Eight predecessor gates carried proxies that B05 invalidated.** Five
(`g01`, `g02`, `g04`, `db01`, `b01`) hold an allow-list of "APP3 paths that
legitimately exist" and match on the shape `design-templates?`, so a public
Template route tripped all five without being any of theirs. Three (`b03`,
`b03a`, `b04`) banned the two routes outright.

Rather than editing eight literals, the shared authority
`tools/app3-accepted-surface.mjs` gained `acceptedPublicTemplatePaths(rootDir)`
and `publicTemplatePaths()`. The five allow-lists consult the first; the three
bans became **both-directions** rules against the second — not published before
B05 is accepted, and *required* once it is. The two flat `FORBIDDEN_ROUTES`
arrays are gone entirely, and the comment that replaces each explains why a ban
is a proxy that stops describing the world the moment its checkpoint runs.

`acceptedPublicTemplatePaths` is kept separate from
`acceptedAdminTemplatePaths` on purpose: three gates count the *Admin* Template
operations, and folding a public path into that list would inflate a number that
is supposed to describe the Admin surface alone.

Two more stale proxies were repaired in the same class:

- `tools/check-app3-b04.test.mjs` pinned `paths, expected 29` as a literal. That
  case stopped describing its own subject the moment B05 shipped; it now derives
  the count from the shared authority.
- `design-template-admin.spec.ts` and `design-template-save.spec.ts` listed the
  two public routes as forbidden. Both now assert what is genuinely un-run:
  B04A's restore, and any byte-delivery path under the public Template prefix
  (asserted by *shape*, since B05A's address is not locked).

## 15. Engineering judgments

```text
ENGINEERING_JUDGMENT = A separate read-only port and adapter
(PublishedDesignTemplateRepository / DrizzlePublishedDesignTemplateRepository)
rather than two more methods on DesignTemplateRepository.
Narrowest safe because the checkpoint's hardest guarantee is "zero writes", and
the strongest form of that promise is a boundary where no write exists to call —
the public module binds a port whose every method is a read, so publishVersion,
archive and saveDraftVersion are unreachable rather than merely uncalled. It is
also honestly a different question (a Template *as published* versus *as
authored*), and it keeps the already-494-line write adapter from growing past
CLAUDE.md §6's split-by-responsibility rule.
```

```text
ENGINEERING_JUDGMENT = The list requires all three scope ids; a partial triple
is a 400, not a broader query.
Narrowest safe because IMP-D042 PO-06 admits no product-wide, side-wide or
wildcard match, so every meaning a partial scope could carry matches more
Templates than the caller asked for. Requiring the triple also makes eligibility
one bounded resolution per request instead of one per row (no N+1), and leaves no
request shape that enumerates the store's published Templates.
```

```text
ENGINEERING_JUDGMENT = A new provider-only port method
ProductPlacementRepository.findPublicPlacementScope, rather than reusing
findPublicPlacement or re-deriving the predicates in Design.
Narrowest safe because the existing method is keyed by the Product's public slug,
which a caller holding three ids cannot supply, and fetching a whole manifest to
test one triple would be a larger read for a smaller question. Copying the
publication and public-category predicates into Design would create a second
definition of "publicly visible" that drifts the first time publication rules
change — the duplication BACKEND_CONVENTIONS.md §10 forbids. The method is a
read, on a controller-free module, and changes no existing behaviour.
```

```text
ENGINEERING_JUDGMENT = An ineligible scope yields an empty list page rather than
a 404 or a 400.
Narrowest safe because it is the same non-disclosure rule the detail applies: a
caller must not learn that a Product exists but has been withdrawn, and "no
Templates here" is indistinguishable from "this Area has none", which is an
ordinary public state. The cursor is still decoded and still refused first, so the
refusal never becomes a side channel for the Product's publication state.
```

```text
ENGINEERING_JUDGMENT = Two error codes, and templateId withheld from both
projections.
Narrowest safe because a third code would name a reason a public caller must not
learn, and the internal id is a correlation handle no public consumer needs —
the public identity of a Template is its slug, which is what the detail read and
APP3-B05A's authorization chain both key on.
```

## 16. Limitations and pre-existing debt

1. **Five suites under `apps/api/src/modules/design/tests/integration/` fail**
   during Nest module construction on missing local configuration
   (`DESIGN_SESSION_SECRET_PEPPER`, then `OBJECT_STORAGE_PROVIDER`). This is the
   gap `APP3-B04` disclosed. None of the five is touched by this checkpoint —
   `git status` was clean for that directory throughout — and B05's own live
   suite runs 17/17 against a disposable PostgreSQL on the separate
   `test/integration/` harness. It still deserves an owner and an environment
   with the full dev stack.

2. **`tools/check-app3-b01n.test.mjs` has one failing case**, *"rejects quietly
   closing the platform Zod/OpenAPI follow-up"*. It mutates
   `FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN`, but the phase document has
   recorded that follow-up as `COMPLETE — CLOSED_BY_APP3-P03` since `APP3-P03`,
   so the mutation is a no-op and no failure fires. Proved pre-existing:
   `git show HEAD:…APP3-DESIGN-TEMPLATES-AND-STUDIO.md` already carries the
   closed token, this checkpoint's diff does not touch that line, and the test
   file is unmodified. The B01N **gate itself** passes. Left alone under §22 —
   B05 does not change that rule's subject.

3. No frontend, worker, Figma or E2E work is included, and none is implied.
   `APP3-D01` remains the frontend gate.

Nothing in this report contradicts these limitations. Where a proof is live it
says so; where a property is asserted from source rather than from a running
system, it says that too.

## 17. Changed files

39 paths in Commit A: 13 new source and test files, 2 new gate files, 11
modified gate/authority files, 5 modified documents, 3 regenerated artifacts, and
5 modified API sources (the composition root, the two Catalog placement files,
and the two predecessor specs whose proxies B05 invalidated).

No migration, no dependency change, no install, no worktree, no junction or
symlink, no root script, no `.env` write, and no credential read or rotation.

## 18. Forward state

```text
APP3-B03  = COMPLETE — REVIEW_ACCEPTED
APP3-B03A = COMPLETE — REVIEW_ACCEPTED
APP3-B04  = COMPLETE — REVIEW_ACCEPTED
APP3-B05  = COMPLETE — REVIEW_DELIVERED

APP3-B05A = DEFINED — BLOCKED_BY_APP3-B05 — NOT STARTED   → now READY
APP3-B04A = READY — NOT STARTED
APP3-D01  = READY — NOT STARTED
APP3-B06C = READY — NOT STARTED

FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED

NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS = NONE
FRONTEND_GATE = APP3-D01
```

```text
NEXT_RECOMMENDED_IMPLEMENTATION_CHECKPOINT = APP3-B05A
```

Chosen from the reconciled DAG, not from numbering. `APP3-B05A` is now the only
remaining **backend** checkpoint on the longest chain `B05 → B05A → S01`, and
`APP3-B05` has given it the thing it authorizes from: a published Template and a
published Version that resolve through a real read.

The S01 reconciliation matters and is stated explicitly: `APP3-S01` is **not**
unblocked by `APP3-D01` alone. §6.1 #36 and §6.24.2 make the Template picker show
a Template preview derivative, so `S01` depends on `B05A` as well —
`NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS` stays `NONE` and `S01` is not implemented
here. `APP3-D01` is the one genuine parallel candidate and the only other thing
gating `S01`. `APP3-B04A` and `APP3-B06C` remain ready and deliberately
unrecommended: they sit on shorter branches that cannot be consumed until `S02`
exists.

## 19. Clean tree and no push

Verified after Commit A and again after Commit B:

```text
branch                = production
git status --porcelain = 0 entries
Commit A               = 1895226 feat(api): add public Design Template reads
Commit A's parent      = 6d532f4 docs(app3): record APP3-B04 evidence
Commit B               = this report only, immediately after Commit A
pushed                 = nothing
amend / squash / rebase = none
```

/**
 * Which Playwright projects each run mode runs (`APP12-E01` §24).
 *
 * Split out of `scripts/run-e2e.mjs`, which had grown past every reviewable
 * size while carrying two unrelated responsibilities: *owning the environment*
 * — databases, containers, processes, teardown — and *cataloguing the modes*
 * that environment can be asked to run. This file is the catalogue. It holds no
 * state, starts nothing, and every entry is a list of project names plus the
 * reasoning for why that mode's topology is the shape it is.
 *
 * The reasoning is the reason this is a documented module rather than a lookup
 * table. Each list below answers "why these projects and not one", and losing
 * that to a refactor would cost more than the file length did.
 */

export const SMOKE = ['storefront-chromium', 'admin-chromium'];
export const FULL = [
  'storefront-chromium',
  'admin-chromium',
  'storefront-firefox',
  'admin-firefox',
  'storefront-webkit',
  'admin-webkit',
];
// APP1-E01 cross-layer acceptance projects. Host/Chromium only: the auth,
// session-mutation and responsive journeys need the host's disposable-database
// access and DevTools-driven checks, which the throwaway Linux container (only
// @playwright/test installed, no workspace) cannot provide.
export const APP1 = ['app1-admin-chromium', 'app1-storefront-chromium'];
// APP4-E01-H02 helper readiness, host/Chromium for the same reason as APP1.
export const APP4 = ['app4-storefront-chromium', 'app4-admin-chromium'];
// APP4-E01-R01 canonical acceptance — one serial project.
export const APP4_R01 = ['app4-r01-chromium'];
// APP4-E01-R01-C1 — the targeted correction, run without the full R01 journey.
export const APP4_R01_C1 = ['app4-r01-c1-chromium'];
// APP5-E01 — the custom-request cross-layer acceptance run. Same topology as the
// APP4 browser tier, plus this run's object storage for the in-process worker.
export const APP5_E01 = ['app5-e01-chromium'];
// APP7-E01 — the deposit-payment cross-layer acceptance run. Same topology as
// the APP5 one (it needs the verification lane, the notification sink and this
// run's object storage) plus the merchant bank account `APP7-B03` fails fast
// without.
export const APP7_E01 = ['app7-e01-chromium'];
// APP12-S01 — the Ready-Made purchase state. The leanest browser topology in the
// file: no Admin, no secret material, no object storage. It needs a disposable
// database carrying a test-only catalog, the real API, the real Storefront and
// the real gateway, and nothing else.
export const APP12_S01 = ['app12-s01-chromium'];
// APP12-H06 — the Wave-1 SEO and public-readiness matrix. The S01 topology plus
// this run's object storage: the run has to fetch an `og:image` and a JSON-LD
// image to prove they are publicly retrievable (`APP12-H06` §10), which needs
// real bytes behind the delivery route rather than only the rows that address
// them. No Admin, no secret material beyond what `AppModule` refuses to start
// without, and no commercial write — every journey is an anonymous read.
export const APP12_H06 = ['app12-h06-chromium'];
// APP12-S02 — the Ready-Made checkout. The S01 topology plus the APP4
// verification lane and the in-process worker, because the customer has to
// receive a real verification code before an order can be created at all. It is
// the first Storefront mode that writes commercial rows, so it runs only
// against the disposable database the orchestrator drops afterwards.
export const APP12_S02 = ['app12-s02-chromium'];
// APP12-S03 — the secure Ready-Made order surface. The S02 topology plus an
// authenticated Admin session, because the customer's screen only moves when an
// operator writes: the run drives the delivered Admin operations from a second
// real session while the browser watches the page. It also needs this run's
// object storage, because the evidence journey uploads a real image.
export const APP12_S03 = ['app12-s03-chromium'];
// APP12-A01 — Admin dynamic category management. The leanest Admin topology in
// the file: a disposable database, the real API, the real Admin and the real
// gateway. No Storefront process is started — A01 changes none of it — and no
// object storage, because a category has no media. It needs the staff-bootstrap
// Admin because every journey is an authenticated operator writing taxonomy.
export const APP12_A01 = ['app12-a01-chromium'];
// APP12-M01.A1 — Admin product multi-image management. The A01 Admin topology
// plus this run's object storage, and that addition is the whole point: the
// subject is a grid of twenty **real photographs**, so the run needs real WebP
// derivatives behind the Admin preview route. Twenty neutral blocks would prove
// nothing about whether twenty images are legible at 157px. No Storefront
// process is started — `M01.S1` owns that surface and is not authorised here.
export const APP12_M01A1 = ['app12-m01a1-chromium'];
// APP12-N02.A01 — Admin Ready-Made sellability authoring. The M01.A1 topology
// **exactly**, and deliberately not a new one: the surface under test is a new
// section of the same product editor, and it needs the same authenticated
// operator, the same disposable database and the same seeded catalog. Two of
// that fixture's Products are the subject rather than the setting — `draft0`
// has no variants because nothing has ever created one, and `published` is a
// live Product in the same state, which is precisely the historical malformed
// shape `N02.G01` found in the development world.
export const APP12_N02A01 = ['app12-n02a01-chromium'];
// APP12-N02.E01 — the final cross-boundary sellability acceptance world. The
// `N02.A01` topology (which is the `M01.A1` one) **plus the Storefront process**,
// and that addition is the whole package: `N02.E01` §6/§7/§16 are claims about an
// operator's variant/SKU write reaching a visitor's Product Detail page, and the
// Admin-only A01 topology cannot carry one of them.
//
// No new fixture. The `M01.A1` dataset is not the setting here but the subject:
// its `pub-3`, `pub-1` and `pub-race` Products are PUBLISHED rows with **zero
// variants**, which is exactly the historical malformed shape §13 has to repair,
// and its four unattached Assets are what §6 and §7 attach to the two Products
// they create from nothing through the real form. Seeding a second catalog would
// only add a second thing to keep in step.
//
// One project rather than four. Every journey is an operator at the Admin origin
// whose *consequence* is read at the Storefront origin, so the run is one chain
// and the public reads open their own context — splitting it across projects
// would lose the state each journey hands the next.
export const APP12_N02E01 = ['app12-n02e01-chromium'];
export const APP12_M01S1 = ['app12-m01s1-chromium'];
// APP12-N01.S01 — the email-only verification UX. The S02 topology exactly, and
// deliberately not a new one: the surface under test is the checkout's own
// verification card, so it needs the same catalog, the same APP4 lane and the
// same in-process worker. What differs is entirely inside the Playwright child
// — the spec composes that worker with a delivering SMTP transport aimed at a
// loopback capture listener it owns, because `S01` §18 forbids reading the code
// out of the recording adapter. Nothing in the orchestrated topology changes,
// which is why this rides `app12S02` everywhere below rather than duplicating
// twelve conditions.
export const APP12_N01S1 = ['app12-n01s1-chromium'];
// APP12-N01.E01 — the same world as N01.S01 (same topology, same in-process
// worker, same loopback capture listener), running the cross-boundary content
// acceptance instead of the UX acceptance. It reuses the S01 mode string on
// purpose: E01 asks what the delivered message said, not what the world was, so
// forking the topology would only create a second thing to keep in step.
export const APP12_N01E1 = ['app12-n01e1-chromium'];
// APP12-M01.E1 — the final cross-boundary acceptance world, and the first mode
// that starts the Admin **and** the Storefront over one catalog. That union is
// the whole point: §11 and §12 are claims about an operator's write reaching a
// visitor's page, and neither the A1 topology (no Storefront) nor the S1 one
// (no operator) can carry them. Three ordered projects rather than one, because
// the three surfaces have three different base origins and Playwright resolves
// `baseURL` per project; they run in declaration order under the config's
// single worker, and their datasets are disjoint by fixture prefix.
export const APP12_M01E1 = [
  'app12-m01e1-domain-chromium',
  'app12-m01e1-admin-chromium',
  'app12-m01e1-cross-chromium',
  'app12-m01e1-sf-chromium',
];
// APP12-A02-C1 — the Admin Ready-Made order branch. The S03 topology exactly:
// a Storefront to place a **real** order through the real checkout, the APP4
// verification lane that order cannot exist without, an authenticated Admin,
// this run's object storage for the evidence journey, and the disposable
// database all of it writes to. The difference from S03 is only which screen is
// under test — there the customer's, here the operator's — so the environment
// is shared rather than duplicated.
export const APP12_A02 = ['app12-a02-chromium'];
// APP12-E01 — the Wave-1 commerce final regression. It rides the S03 topology
// rather than declaring one, for the reason A02 does: the surfaces it regresses
// are the ones that suite already starts — the Storefront, the Admin origin,
// this run's object storage and the APP4 verification lane. What E01 adds is
// not topology but *composition*: its world module points the worker's
// notification transport at a real SMTP listener, so the verification code and
// the ORDER_ACCESS link come off the wire instead of out of a recording array
// (§3.1, §3.7). Three projects, split by what each needs: the commerce journey
// places real orders over that boundary, the review journey reaches
// PAYMENT_UNDER_REVIEW on the recording topology so an accessibility result is
// never hostage to a delivery defect, and the public surface sweep (CSP,
// security headers, SEO truth) is anonymous and must not inherit a customer's or
// an operator's state.
export const APP12_E01 = [
  'app12-e01-commerce-chromium',
  'app12-e01-review-chromium',
  'app12-e01-public-chromium',
];
// APP12-H01 — the Wave-1 live security acceptance. The A02 topology exactly,
// because the security journeys need the same commercial universe: a real
// verified Ready-Made order to hold an ORDER_ACCESS grant, an authenticated
// operator to price it, this run’s object storage for the evidence lane, and
// the disposable database all of it writes to. Nothing is added to the
// topology; only the subject differs — there the screens, here what they
// refuse.
export const APP12_H01 = ['app12-h01-chromium'];
// The same topology with the custom capability RELEASED, for the one journey
// that cannot be proved with it withheld: that a real REQUEST_ACCESS grant and
// a real ORDER_ACCESS grant cannot reach each other’s operations. It is a
// separate run rather than a second project because the release state is read
// once when the API composes its module graph, so one process cannot serve
// both.
export const APP12_H01_WAVE2 = ['app12-h01-wave2-chromium'];
// APP12-H08 — the Wave-1 accessibility and compatibility gate. The A02/H01
// topology exactly, and for the same reason those two share it: the audit needs
// the *whole* commercial universe on screen — a real purchasable catalog, a real
// verified checkout, a real ORDER_ACCESS surface and a real authenticated
// operator working the same order — because an accessibility finding on a
// fixture-rendered page is a finding about the fixture.
//
// Four projects rather than one, and the split is the checkpoint's own §11
// matrix rather than a convenience: the customer audit and the operator audit
// run on different origins, and the two non-Chromium engines run a *smoke*
// (§11: "Do not test every route in every browser") rather than the full audit.
export const APP12_H08 = [
  'app12-h08-storefront-chromium',
  'app12-h08-admin-chromium',
  'app12-h08-firefox',
  'app12-h08-webkit',
];
// APP12-V01 — the professional UI/UX live audit. The H08 topology plus the
// content-density fixture, because the subject is what a *populated* product
// looks like: a Discover grid with one card and an Admin table with one row are
// calm by accident, and a critique written from them would be a critique of the
// fixture. Four projects, split by origin and by what each one has to build —
// the public browsing surfaces need no order, the commerce audit places one, the
// Admin audit works it, and the Admin shell tour opens every operator route.
export const APP12_V01 = [
  'app12-v01-public-chromium',
  'app12-v01-commerce-chromium',
  'app12-v01-admin-shell-chromium',
  'app12-v01-admin-order-chromium',
  'app12-v02-perf-chromium',
];

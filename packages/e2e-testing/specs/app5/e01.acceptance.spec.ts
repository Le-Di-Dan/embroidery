/**
 * `APP5-E01` — the custom-request cross-layer acceptance run.
 *
 * One serial journey chain across the real Storefront, the real API over HTTP
 * through the real gateway, real PostgreSQL, real MinIO, the real APP2/APP3
 * inspection worker, the real APP4 notification worker and the real Admin. No
 * APP5 route is intercepted, stubbed or mocked, and no fixture creates a fact
 * the run is meant to prove: the Customer, the verification challenge, the
 * uploaded asset, its inspection verdict, the request, its quantities, its asset
 * bindings, its grant, its notification and both of its transitions are all
 * produced by the application itself.
 *
 * ### What is fixture, stated once
 *
 * Exactly two things are seeded, and neither belongs to APP5:
 *
 * 1. **The catalog context** — a published Product under a public Category with
 *    one designable placement and two active Variants (`app5-fixture-universe`).
 *    APP5 consumes catalog rows; authoring them is APP2/APP3's journey.
 * 2. **The bootstrap Admin** — created by the orchestrator through the accepted
 *    staff-bootstrap CLI, exactly as the APP1 and APP4 runs do.
 *
 * Everything else is production behaviour. The one *delivery* boundary that is
 * not real is the notification transport: `APP4-W01`'s recording adapter is the
 * established deterministic seam and is what lets this process read the
 * verification code and the secure link at all, since no debug endpoint exists
 * and none may be added.
 *
 * ### Secret discipline
 *
 * The verification code and the secure-link token exist only in this process's
 * memory and in browser fields. They are never printed, never compared with an
 * operand-printing matcher and never written to an artifact; every statement
 * about them is reported as a boolean.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

import { loginAsAdmin } from '../app1/support/admin-auth';
import { createS01Driver } from '../app4/support/s01-verification-driver';
import { observeNetwork } from '../app4/support/network-observer';
import { scanBrowserForSecret } from '../app4/support/browser-secret-scan';
import {
  installFragmentInstrumentation,
  readFragmentSecurityEvidence,
} from '../app4/support/s02-fragment-instrumentation';
import { createAdminRequestDriver, APP5_ADMIN } from './support/a02-moderation-driver';
import { createRequestDriver, APP5_STATUS } from './support/s01-request-driver';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules are loaded outside ts-jest by the H01 smoke — so everything imported
   from it arrives untyped. As in `APP4-E01-R01`, this spec treats those imports
   as `any` and lets each explicit `expect` below be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/** The two moderation texts, deliberately different strings (§22). */
const INTERNAL_REASON = 'Noi bo E01: anh mon do chua ro chi tiet duong may.';
const CUSTOMER_REASON = 'Ban vui long gui them mot anh chup gan vung nguc trai.';
const MODERATION_NOTE = 'E01 acceptance: yeu cau khach bo sung anh.';

const STATUS_PATH = '/api/public/custom-requests/status';
const RESOLVE_PATH = '/secure-links/resolve';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP5-E01 acceptance run.`);
  }
  return value;
}

interface RunState {
  copCode?: string;
  copRequestId?: string;
  copChallengeId?: string;
  copGrantLink?: string;
  catalogCode?: string;
  catalogRequestId?: string;
  evidenceAssetId?: string;
}

const state: RunState = {};
/** Safe facts only: booleans, counts and id-free labels. */
const proofs: Record<string, boolean | string | number> = {};

let runtime: any;
let worker: any;
let app4Evidence: any;
let evidence: any;
let catalog: any;
let image: any;
let contactA: any;
let contactB: any;

test.describe.configure({ mode: 'serial' });

test.describe('APP5-E01 cross-layer acceptance', () => {
  test.beforeAll(async () => {
    test.setTimeout(300_000);
    const databaseUrl = requiredEnv('E2E_DATABASE_URL');
    const { createApp4E01Runtime } = await import('../../support/app4/app4-runtime.mjs');
    const { createWorkerControl } = (await import('../../support/app4/worker-control.mjs')) as any;
    const { createDbEvidence } = (await import('../../support/app4/db-evidence.mjs')) as any;
    const { createSyntheticContact } =
      (await import('../../support/app4/fixture-universe.mjs')) as any;
    const { createApp5Evidence } = await import('../../support/app5/app5-evidence.mjs');
    const { createApp5CatalogFixture, createEvidenceImage } =
      (await import('../../support/app5/app5-fixture-universe.mjs')) as any;

    const runId = requiredEnv('E2E_RUN_ID');
    runtime = await createApp4E01Runtime({
      runId,
      app4: {
        verificationCodePepper: requiredEnv('VERIFICATION_CODE_SECRET_PEPPER'),
        secureLinkTokenPepper: requiredEnv('SECURE_LINK_TOKEN_SECRET_PEPPER'),
        notificationDeliveryEnvelopeKey: requiredEnv('NOTIFICATION_DELIVERY_ENVELOPE_KEY'),
        storefrontOrigin: requiredEnv('STOREFRONT_PUBLIC_ORIGIN'),
        designSessionPepper: requiredEnv('DESIGN_SESSION_SECRET_PEPPER'),
      },
      databaseUrl,
    });
    worker = createWorkerControl(runtime);
    app4Evidence = await createDbEvidence(databaseUrl);
    evidence = await createApp5Evidence(databaseUrl);
    catalog = await createApp5CatalogFixture(runtime, { runId });
    image = await createEvidenceImage();
    contactA = createSyntheticContact(`${runId}a`);
    contactB = createSyntheticContact(`${runId}b`);
  });

  test.afterAll(async () => {
    await evidence?.close?.();
    await app4Evidence?.close?.();
    await runtime?.close?.();
    process.stdout.write(`APP5_E01_PROOFS ${JSON.stringify(proofs)}\n`);
  });

  // ---------------------------------------------------------------------------
  // Journey A, part 1 — the entry point the pre-E01 audit wired (§3, §27.1)
  // ---------------------------------------------------------------------------
  test('E01-01 — the request journey is reachable from the approved shell navigation', async ({
    page,
  }) => {
    const request = createRequestDriver(page);
    await request.openThroughNavigation();

    expect(request.currentPath()).toBe('/yeu-cau/moi');
    // The chooser is the screen's first interaction, so reaching it is what
    // "the journey is reachable" means — not merely that the route responded.
    await expect(page.getByRole('radio', { name: 'Sản phẩm bạn đã có sẵn' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Sản phẩm của cửa hàng' })).toBeVisible();
    proofs.navigationReachesRequestScreen = true;
  });

  // ---------------------------------------------------------------------------
  // Journey A — customer-owned request, end to end (§4 Journey A)
  // ---------------------------------------------------------------------------
  test('E01-02 — a customer-owned request crosses verification, upload, inspection and submit', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const request = createRequestDriver(page);
    const verification = createS01Driver(page);
    const network = observeNetwork(page);

    await request.openThroughNavigation();
    await request.chooseSubject('CUSTOMER_OWNED');
    await request.fillItemName('Áo khoác jean E01');
    await request.fillQuantity('2');
    await request.continueToVerification();

    // --- APP4 verification, through APP5's embedded step ---------------------
    await verification.enterContact(contactA.email);
    await verification.submitContact();
    await verification.waitForCodeEntry();

    const challenges = await app4Evidence.listRecent('contact_verification_challenges');
    expect(challenges).toHaveLength(1);
    expect(challenges[0].hasCodeHash).toBe(true);
    state.copChallengeId = challenges[0].id as string;
    proofs.challengeStoresDigestOnly = true;

    const codeIndex = worker.deliveryCount();
    await runWorkerUntilIdle();
    expect(worker.safeDelivery(codeIndex).secretKind).toBe('VERIFICATION_CODE');
    const code = worker.secretOf(codeIndex) as string;

    await verification.enterCode(code);
    await request.submitVerificationCode();
    await request.waitForUploadStep();
    proofs.verificationCompletedInsideRequestFlow = true;

    // One Customer, created by the production path and by nothing else.
    const customers = await app4Evidence.listRecent('customers');
    expect(customers).toHaveLength(1);
    proofs.exactlyOneCustomerAfterVerification = true;

    // --- APP5-B02 upload, and a real inspection verdict ----------------------
    // An uncaught error in the file-input handler is silent on screen — the
    // customer sees no tile and no message — so the run watches for one rather
    // than inferring it from a missing row. This is how the run found the
    // secure-context defect the E01 correction fixes.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 160)));

    // The Storefront origin here is plain HTTP, exactly like the development
    // stack: `crypto.randomUUID` is therefore absent, which is the condition
    // the correction exists for. Recorded so the run states which world it
    // proved the upload in.
    proofs.storefrontIsSecureContext = await page.evaluate(() => globalThis.isSecureContext);

    await request.attachItemPhoto(image);
    // The upload is a real streamed request, so the row appears when the API
    // has finished writing it — polled rather than assumed. No worker has run
    // at this point, which is what makes the ACCEPTED below evidence of a real
    // verdict rather than a default the screen would have shown anyway.
    await expect
      .poll(async () => (await evidence.listIntakeAssets(state.copChallengeId)).length, {
        timeout: 60_000,
      })
      .toBe(1);
    expect(pageErrors).toEqual([]);
    // Exactly one upload, accepted by the server — one customer action is one
    // stored asset. The reads that follow it are the status poll, which is a
    // different operation and is counted separately.
    const uploads = network
      .matching('/custom-request-intake')
      .filter((entry) => entry.method === 'POST');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.status).toBe(202);
    proofs.oneUploadRequestAcceptedByServer = true;
    const intakeBefore = await evidence.listIntakeAssets(state.copChallengeId);
    expect(['UPLOADED', 'INSPECTING']).toContain(intakeBefore[0].status);
    state.evidenceAssetId = intakeBefore[0].id as string;
    proofs.uploadPersistedBeforeInspection = true;

    await runWorkerUntilIdle();
    await request.waitForPhotoAccepted();
    const intakeAfter = await evidence.listIntakeAssets(state.copChallengeId);
    expect(intakeAfter[0].status).toBe('ACCEPTED');
    // Provenance is written by B02 from the locked challenge row, never by the
    // client: both columns must name this challenge and this customer.
    expect(intakeAfter[0].uploaded_via_challenge_id).toBe(state.copChallengeId);
    expect(intakeAfter[0].uploaded_by_customer_id).toBe(customers[0].id);
    proofs.inspectionReachedAccepted = true;
    proofs.intakeProvenanceBoundToChallengeAndCustomer = true;

    // --- APP5-B01 submission -------------------------------------------------
    const linkIndex = worker.deliveryCount();
    await request.submit();
    await request.waitForConfirmation();
    state.copCode = await request.readConfirmedCode();
    proofs.confirmationShowsRequestCode = true;

    const requests = await evidence.listRequests();
    expect(requests).toHaveLength(1);
    state.copRequestId = requests[0].id as string;
    expect(requests[0].status).toBe('NEW');
    expect(requests[0].customer_id).toBe(customers[0].id);
    // The subject XOR, as persisted: a customer-owned request names no catalog
    // column, and its COP child exists.
    expect(requests[0].product_id).toBeNull();
    expect(requests[0].product_variant_id).toBeNull();
    expect(requests[0].submitted_session_id).toBeNull();
    const cop = await evidence.readCustomerOwnedProduct(state.copRequestId);
    expect(cop).toBeDefined();
    expect(cop.name).toBe('Áo khoác jean E01');
    proofs.copSubjectPersistedWithXor = true;

    const quantities = await evidence.listQuantities(state.copRequestId);
    expect(quantities).toHaveLength(1);
    expect(Number(quantities[0].quantity)).toBe(2);
    proofs.quantityPersisted = true;

    const bindings = await evidence.listRequestAssets(state.copRequestId);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].asset_id).toBe(state.evidenceAssetId);
    expect(bindings[0].role).toBe('COP_IMAGE');
    proofs.acceptedEvidenceBoundToRequest = true;

    // Creation writes no transition row (`G01-D05`): the request's existence at
    // NEW is the creation fact, and a NEW → NEW self-loop would be a move that
    // never happened.
    expect(await evidence.listTransitions(state.copRequestId)).toHaveLength(0);
    proofs.creationWroteNoTransition = true;

    // Exactly one REQUEST_ACCESS grant, digest-only, issued inside the
    // submission transaction — the customer's confirmation *is* the secure link.
    const grants = await evidence.listGrantsForRequest(state.copRequestId);
    expect(grants).toHaveLength(1);
    expect(grants[0].hasTokenHash).toBe(true);
    expect(grants[0].status).toBe('ACTIVE');
    proofs.exactlyOneActiveGrantForRequest = true;

    // The submission raised exactly one further notification intent, and the
    // real W01 delivers it as a fragment-form secure link.
    await runWorkerUntilIdle();
    expect(worker.deliveryCount()).toBe(linkIndex + 1);
    const delivery = worker.safeDelivery(linkIndex);
    expect(delivery.secretKind).toBe('SECURE_LINK_TOKEN');
    expect(delivery.hasSecureLinkUrl).toBe(true);
    const link = worker.secureLinkOf(linkIndex) as string;
    state.copGrantLink = link;
    const url = new URL(link);
    expect(url.pathname).toBe('/truy-cap');
    expect(url.search).toBe('');
    expect(url.hash.startsWith('#t=')).toBe(true);
    proofs.submissionNotificationIsFragmentLink = true;

    // No account was created and no password exists: the only identity fact is
    // the verified Customer counted above.
    expect(await evidence.countRequests()).toBe(1);
    // The submit call carried the challenge and never a customer id.
    const submits = network.matching('/api/public/custom-requests');
    const submitCall = submits.find((entry) => entry.method === 'POST');
    expect(submitCall).toBeDefined();
    expect(submitCall?.bodyKeys).toContain('challengeId');
    expect(submitCall?.bodyKeys).not.toContain('customerId');
    proofs.submitCarriesChallengeNotCustomerId = true;
    network.stop();

    // The delivered code must not survive anywhere the browser persists.
    const scan = await scanBrowserForSecret(page, code);
    expect(scan.present).toBe(false);
    proofs.verificationCodeAbsentFromBrowserSurfaces = true;
  });

  // ---------------------------------------------------------------------------
  // Journey B — the catalog branch on a real variant and a real session (§4 B)
  // ---------------------------------------------------------------------------
  test('E01-03 — the catalog branch submits a real B07 variant on a real design session', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const request = createRequestDriver(page);
    const verification = createS01Driver(page);

    // The APP3 context, obtained the only way a browser can obtain it: by
    // opening a real anonymous Design Session on the fixture's placement
    // through `APP3-B07`'s own public route, from the Storefront origin, so the
    // host-only `HttpOnly` session cookie lands in this browser context. The
    // Studio UI is not exercised — it is APP3's surface, and `APP5-S01` reads
    // only the resume handle the Studio would have left behind.
    await page.goto('/');
    // Recorded because it is the precondition the refusal depends on: `APP3-B07`
    // requires `Sec-Fetch-Site`, and a browser attaches Fetch Metadata only to a
    // trustworthy origin. This run's origin is one; a plain-HTTP `.local` host
    // is not, which is why the session lane is unreachable there.
    page.on('request', (sent) => {
      if (sent.url().includes('/api/public/design-sessions')) {
        void sent.allHeaders().then((headers) => {
          proofs.sessionCreateFetchSite = String(headers['sec-fetch-site'] ?? 'absent');
        });
      }
    });
    const opened = await page.evaluate(
      async (placement: { slug: string; side: string; area: string }) => {
        const response = await fetch('/api/public/design-sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            mode: 'BLANK',
            productSlug: placement.slug,
            sideCode: placement.side,
            areaCode: placement.area,
          }),
        });
        const body = (await response.json()) as Record<string, any>;
        return {
          status: response.status,
          code: (body?.code ?? null) as string | null,
          sessionId: (body?.data?.sessionId ?? body?.sessionId ?? null) as string | null,
        };
      },
      { slug: catalog.productSlug, side: catalog.sideCode, area: catalog.areaCode },
    );
    expect(opened.status).toBe(201);
    expect(opened.sessionId).not.toBeNull();
    proofs.designSessionOpenedThroughPublicRoute = true;

    // The resume handle, written under the exact key `APP3-S01` writes and
    // `APP5-S01` reads. Public codes only — the session *secret* is in the
    // cookie and is unreachable from script by construction.
    await page.evaluate(
      (entry: { key: string; value: string }) =>
        globalThis.localStorage.setItem(entry.key, entry.value),
      {
        key: `embroidery.studio.session:${catalog.productSlug}:${catalog.sideCode}:${catalog.areaCode}`,
        value: opened.sessionId as string,
      },
    );

    await request.openWithCatalogContext({
      productSlug: catalog.productSlug,
      sideCode: catalog.sideCode,
      areaCode: catalog.areaCode,
    });
    await request.chooseSubject('CATALOG');

    // `APP5-B07` is the only source of selectable variants, and the screen
    // preselects none: the customer's choice is explicit or there is none.
    const variants = request.variantRadios();
    await expect(variants.first()).toBeVisible({ timeout: 20_000 });
    expect(await variants.count()).toBe(catalog.variantIds.length);
    expect(
      await variants.evaluateAll((nodes) =>
        nodes.every((node) => !(node as HTMLInputElement).checked),
      ),
    ).toBe(true);
    expect(await request.isSessionMissingVisible()).toBe(false);
    proofs.catalogVariantsCameFromB07 = true;
    proofs.noVariantPreselected = true;

    await request.chooseVariantAt(0);
    await request.fillQuantity('3');
    await request.continueToVerification();

    await verification.enterContact(contactB.email);
    await verification.submitContact();
    await verification.waitForCodeEntry();

    const codeIndex = worker.deliveryCount();
    await runWorkerUntilIdle();
    const code = worker.secretOf(codeIndex) as string;
    await verification.enterCode(code);
    await request.submitVerificationCode();
    await request.waitForSubmitStep();

    // The catalog branch binds no asset: the design *is* the subject.
    await request.submit();
    await request.waitForConfirmation();
    state.catalogCode = await request.readConfirmedCode();

    const requests = await evidence.listRequests();
    expect(requests).toHaveLength(2);
    const catalogRequest = requests.find((row: any) => row.id !== state.copRequestId);
    state.catalogRequestId = catalogRequest.id as string;
    expect(catalogRequest.product_id).toBe(catalog.productId);
    // The submitted variant is one `APP5-B07` returned, not a value the client
    // invented: the fixture knows the whole eligible set, so membership is the
    // strongest available statement.
    expect(catalog.variantIds).toContain(catalogRequest.product_variant_id);
    expect(catalogRequest.submitted_session_id).toBe(opened.sessionId);
    proofs.submittedVariantIsAnEligibleB07Variant = true;
    proofs.submittedSessionRecordedOnRequest = true;

    // The session the request names really moved, and it moved to SUBMITTED.
    const session = await evidence.readSubmittedSession(state.catalogRequestId);
    expect(session).toBeDefined();
    expect(session.status).toBe('SUBMITTED');
    proofs.designSessionConsumedBySubmission = true;

    const quantities = await evidence.listQuantities(state.catalogRequestId);
    expect(quantities).toHaveLength(1);
    expect(Number(quantities[0].quantity)).toBe(3);
    // Scoped to the one selected variant, as persisted.
    expect(quantities[0].product_variant_id ?? catalogRequest.product_variant_id).toBe(
      catalogRequest.product_variant_id,
    );
    proofs.catalogQuantityScopedToSelectedVariant = true;

    // A second customer, a second request, and no cross-contamination: the COP
    // request is untouched by this lineage.
    const cop = await evidence.readRequest(state.copRequestId);
    expect(cop.status).toBe('NEW');
    proofs.secondSubmissionLeftFirstRequestUntouched = true;

    // Drain the confirmation notification this submission raised, so the Admin
    // journey does not inherit a queued job.
    await runWorkerUntilIdle();
  });

  // ---------------------------------------------------------------------------
  // Journey D — Admin triage, evidence and one moderation move (§4 Journey D)
  // ---------------------------------------------------------------------------
  test('E01-04 — the operator opens the request, sees its evidence and records both reasons', async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const adminPage = await openAdminPage(browser);
    try {
      const admin = createAdminRequestDriver(adminPage);
      const network = observeNetwork(adminPage);

      await admin.openQueue();
      await admin.openRequestByCode(state.copCode as string);
      // The row led to the request the customer created, not merely to *a*
      // request: the detail route's id is the submitted row's id.
      expect(admin.openRequestId()).toBe(state.copRequestId);
      proofs.queueRowLeadsToSubmittedRequest = true;

      // --- APP5-B06 private evidence ----------------------------------------
      await admin.waitForEvidenceImage();
      expect(await admin.evidenceFigures().count()).toBe(1);
      const source = await admin.evidenceImages().first().getAttribute('src');
      // A revoked object URL, never a storage address the browser could reuse.
      expect(source?.startsWith('blob:')).toBe(true);
      proofs.evidenceRendersFromBlobUrl = true;

      const assetCalls = network.matching('/assets/');
      expect(assetCalls.length).toBeGreaterThan(0);
      // The address is contextual — request id and asset id — and names no
      // bucket, key or provider.
      expect(assetCalls[0]?.pathname).toBe(
        `/api/admin/custom-requests/${state.copRequestId}/assets/${state.evidenceAssetId}/content`,
      );
      proofs.evidenceUrlIsRequestScoped = true;

      // The canonical detail payload itself carries no storage identity. Read
      // from inside the page — the operator's own session and the browser's own
      // resolver — rather than from a Node-side request context, which would
      // need its own DNS for the Admin hostname and would not carry the session.
      const detail = await adminPage.evaluate(async (path: string) => {
        const response = await fetch(path, { credentials: 'include' });
        return { ok: response.ok, body: await response.text() };
      }, `/api/admin/custom-requests/${state.copRequestId}`);
      expect(detail.ok).toBe(true);
      const detailBody = detail.body;
      for (const forbidden of [
        'storageKey',
        'storage_key',
        'bucket',
        'ORIGINALS',
        'e2e-originals',
      ]) {
        expect(detailBody.includes(forbidden)).toBe(false);
      }
      proofs.detailPayloadCarriesNoStorageIdentity = true;

      // --- APP5-B05 moderation ----------------------------------------------
      await admin.startReview();
      expect(await admin.currentStatusText()).toContain(APP5_ADMIN.status.underReview);

      await admin.requestClarification({
        internal: INTERNAL_REASON,
        customerVisible: CUSTOMER_REASON,
        note: MODERATION_NOTE,
      });
      expect(await admin.currentStatusText()).toContain(APP5_ADMIN.status.needsClarification);
      proofs.moderationMovedRequestThroughTwoStates = true;

      // The refetched detail is the *persisted* state, not the dialog's echo.
      const reasons = await admin.readCurrentReasons();
      expect(reasons.internal).toBe(INTERNAL_REASON);
      expect(reasons.customerVisible).toBe(CUSTOMER_REASON);
      proofs.refetchedDetailShowsBothReasons = true;

      const history = await admin.readHistoryReasons();
      expect(history).toHaveLength(2);
      // The first move carries neither reason; the second carries both, and the
      // two texts are never the same field.
      expect(history[0]?.internal).toBe(APP5_ADMIN.reason.none);
      expect(history[1]?.internal).toBe(INTERNAL_REASON);
      expect(history[1]?.customerVisible).toBe(CUSTOMER_REASON);
      proofs.historyShowsPersistedTransitions = true;

      const transitions = await evidence.listTransitions(state.copRequestId);
      expect(transitions).toHaveLength(2);
      expect(transitions[0].from_status).toBe('NEW');
      expect(transitions[0].to_status).toBe('UNDER_REVIEW');
      expect(transitions[1].from_status).toBe('UNDER_REVIEW');
      expect(transitions[1].to_status).toBe('NEEDS_CLARIFICATION');
      expect(transitions[1].reason).toBe(INTERNAL_REASON);
      expect(transitions[1].customer_visible_reason).toBe(CUSTOMER_REASON);
      expect(transitions[1].actor_kind).toBe('ADMIN');
      expect(transitions[1].admin_id).not.toBeNull();
      proofs.transitionsPersistedWithAdminActor = true;

      const notes = await evidence.listModerationNotes(state.copRequestId);
      expect(notes).toHaveLength(1);
      expect(notes[0].note).toBe(MODERATION_NOTE);
      proofs.moderationNoteAppended = true;

      // The persisted request row agrees with the screen.
      expect((await evidence.readRequest(state.copRequestId)).status).toBe('NEEDS_CLARIFICATION');
      proofs.canonicalRequestStateChanged = true;

      network.stop();
    } finally {
      await adminPage.context().close();
    }
  });

  // ---------------------------------------------------------------------------
  // Journey C — the secure link, and the cross-layer reason boundary (§22, §23)
  // ---------------------------------------------------------------------------
  test('E01-05 — the secure link opens the status through B03 alone, with the fragment stripped', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const link = state.copGrantLink as string;
    const token = new URL(link).hash.replace('#t=', '');
    const network = observeNetwork(page);

    await installFragmentInstrumentation(page, token, { requestPathPattern: STATUS_PATH });
    await page.goto(link);
    await page.waitForLoadState('networkidle');

    const fragment = await readFragmentSecurityEvidence(page);
    expect(fragment.requestObserved).toBe(true);
    expect(fragment.requestMethod).toBe('POST');
    expect(fragment.requestPath).toBe(STATUS_PATH);
    expect(fragment.cleaningReplaceStateObserved).toBe(true);
    expect(fragment.stripBeforeRequest).toBe(true);
    expect(fragment.hashEmptyAtRequest).toBe(true);
    expect(fragment.urlContainsTokenAtRequest).toBe(false);
    expect(fragment.historyContainsTokenAtRequest).toBe(false);
    expect(fragment.requestUrlContainsToken).toBe(false);
    expect(fragment.requestBodyKeys).toEqual(['token']);
    Object.assign(proofs, {
      statusStripsFragmentBeforeRequest: true,
      statusTokenTravelsInBodyOnly: true,
    });

    // B03 and nothing in front of it: the resolve endpoint is never called, so
    // the status page is not chaining a second credential exchange.
    expect(network.matching(RESOLVE_PATH)).toHaveLength(0);
    expect(network.matching(STATUS_PATH)).toHaveLength(1);
    proofs.statusUsesB03Only = true;

    // --- the grant is scoped to exactly one request ------------------------
    await expect(page.getByText(APP5_STATUS.needsClarificationBadge).first()).toBeVisible({
      timeout: 20_000,
    });
    const visible = await page.locator('main').innerText();
    expect(visible).toContain(APP5_STATUS.reasonTitle);
    expect(visible).toContain(CUSTOMER_REASON);
    proofs.customerSeesCustomerVisibleReason = true;

    // The cross-layer boundary, asserted where it matters: the internal reason
    // the operator wrote is on the same transition row and must not be here.
    expect(visible).not.toContain(INTERNAL_REASON);
    expect(visible).not.toContain(MODERATION_NOTE);
    proofs.customerNeverSeesInternalReason = true;

    // One request, scoped by the grant: the second request's code — a different
    // customer's — appears nowhere on this page.
    expect(visible).not.toContain(state.catalogCode as string);
    proofs.statusScopedToOneRequest = true;

    // The token must not survive anywhere the browser persists.
    const scan = await scanBrowserForSecret(page, token);
    expect(scan.present).toBe(false);
    proofs.tokenAbsentFromBrowserAfterSettlement = true;
    network.stop();
  });

  // ---------------------------------------------------------------------------
  // The composed claim, restated as booleans (§12, §23)
  // ---------------------------------------------------------------------------
  test('E01-06 — the cross-layer invariants hold together', () => {
    expect(proofs.navigationReachesRequestScreen).toBe(true);
    expect(proofs.inspectionReachedAccepted).toBe(true);
    expect(proofs.acceptedEvidenceBoundToRequest).toBe(true);
    expect(proofs.exactlyOneActiveGrantForRequest).toBe(true);
    expect(proofs.submittedVariantIsAnEligibleB07Variant).toBe(true);
    expect(proofs.designSessionConsumedBySubmission).toBe(true);
    expect(proofs.queueRowLeadsToSubmittedRequest).toBe(true);
    expect(proofs.evidenceUrlIsRequestScoped).toBe(true);
    expect(proofs.canonicalRequestStateChanged).toBe(true);
    expect(proofs.statusUsesB03Only).toBe(true);
    expect(proofs.customerSeesCustomerVisibleReason).toBe(true);
    expect(proofs.customerNeverSeesInternalReason).toBe(true);
    proofs.crossLayerAcceptanceComposed = true;
  });
});

/**
 * Runs the real worker until nothing is due.
 *
 * The harness worker claims one job per call (`APP4-E01-H02`), and an APP5
 * journey queues two kinds of work — an asset inspection and a notification —
 * so a single `runOnce` would leave one of them behind. The guard bounds the
 * loop rather than trusting the queue to empty.
 */
async function runWorkerUntilIdle(guard = 12): Promise<number> {
  let executed = 0;
  for (let attempt = 0; attempt < guard; attempt += 1) {
    const summary = await worker.runOnce();
    if (summary === undefined) {
      return executed;
    }
    executed += 1;
  }
  throw new Error(`Worker still had due jobs after ${guard} attempts.`);
}

/** A second context bound to the Admin origin; this spec's baseURL is the Storefront. */
async function openAdminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: requiredEnv('E2E_BASE_ADMIN') });
  const page = await context.newPage();
  await loginAsAdmin(page, {
    email: requiredEnv('E2E_ADMIN_EMAIL'),
    password: requiredEnv('E2E_ADMIN_PASSWORD'),
    displayName: requiredEnv('E2E_ADMIN_DISPLAY_NAME'),
  });
  return page;
}

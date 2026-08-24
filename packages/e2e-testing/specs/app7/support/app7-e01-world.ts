/**
 * The one `APP7-E01` acceptance world, assembled once per spec file.
 *
 * ### What it puts in the room
 *
 * Everything §5 names, and nothing simulated:
 *
 * - real PostgreSQL (this run's disposable database) and real MinIO, started by
 *   the orchestrator;
 * - the real API HTTP process behind the real Nginx gateway;
 * - the real Storefront and Admin production builds;
 * - the real `AppModule` and the real `WorkerModule`, composed **in this
 *   process** against the same database and the same ephemeral secret material,
 *   because the APP7 order-conversion runtime and the evidence-inspection lane
 *   have to be driven one attempt at a time and the notification sink the
 *   step-up code arrives at is in-memory with no network or database sink.
 *
 * No payment provider exists anywhere in the topology, and none is stubbed:
 * there is nothing to stub.
 *
 * ### What is fixture
 *
 * Exactly the APP6 hand-off (`app7-world.mjs`) and the bootstrap Admin the
 * orchestrator creates through the accepted staff-bootstrap CLI. Every APP7
 * fact — Order, OrderItems, DEPOSIT and REMAINING obligations, attempts,
 * transfer evidence, reconciliations, `DEPOSIT_PAID` — is produced by the
 * delivered application during the run.
 *
 * ### Secret discipline
 *
 * The secure-link token, the step-up code and the Admin password exist only in
 * this process's memory and in browser fields. They are never printed, never
 * put in an assertion message and never written to an artifact; every statement
 * about them is reported as a boolean.
 *
 * Test-only.
 */
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules are loaded outside ts-jest by the APP4 H01 smoke — so everything
   imported from it arrives untyped. As in `APP4-E01-R01` and `APP5-E01`, this
   module treats those imports as `any` and lets each explicit `expect` in the
   specs be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

export interface App7World {
  readonly runtime: any;
  readonly world: any;
  readonly evidence: any;
  readonly control: any;
  readonly databaseUrl: string;
  /** The merchant bank facts this run configured the API with. Never printed. */
  readonly merchant: {
    bankBin: string;
    accountNumber: string;
    accountName: string;
    bankDisplayName: string;
  };
  close(): Promise<void>;
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP7-E01 acceptance run.`);
  }
  return value;
}

/**
 * Boots the in-process halves of the world against the already-running stack.
 *
 * `createApp4E01Runtime` is reused rather than reimplemented: it is the accepted
 * foundation that composes both real Nest graphs against one database and one
 * secret universe, and APP7 needs exactly that with a different set of
 * questions asked of it.
 */
export async function createApp7World(): Promise<App7World> {
  const databaseUrl = requiredEnv('E2E_DATABASE_URL');
  const { createApp4E01Runtime } = await import('../../../support/app4/app4-runtime.mjs');
  const { createApp7World: createWorld } =
    (await import('../../../support/app7/app7-world.mjs')) as any;
  const { createApp7Evidence } = (await import('../../../support/app7/app7-evidence.mjs')) as any;
  const { createApp7Control } = (await import('../../../support/app7/app7-control.mjs')) as any;

  const runtime = await createApp4E01Runtime({
    runId: requiredEnv('E2E_RUN_ID'),
    app4: {
      verificationCodePepper: requiredEnv('VERIFICATION_CODE_SECRET_PEPPER'),
      secureLinkTokenPepper: requiredEnv('SECURE_LINK_TOKEN_SECRET_PEPPER'),
      notificationDeliveryEnvelopeKey: requiredEnv('NOTIFICATION_DELIVERY_ENVELOPE_KEY'),
      storefrontOrigin: requiredEnv('STOREFRONT_PUBLIC_ORIGIN'),
      designSessionPepper: requiredEnv('DESIGN_SESSION_SECRET_PEPPER'),
    },
    databaseUrl,
  });

  const world = await createWorld(runtime, { databaseUrl });
  const evidence = await createApp7Evidence(databaseUrl);
  const control = createApp7Control(runtime);

  return {
    runtime,
    world,
    evidence,
    control,
    databaseUrl,
    merchant: {
      bankBin: requiredEnv('PAYMENT_MERCHANT_BANK_BIN'),
      accountNumber: requiredEnv('PAYMENT_MERCHANT_ACCOUNT_NUMBER'),
      accountName: requiredEnv('PAYMENT_MERCHANT_ACCOUNT_NAME'),
      bankDisplayName: requiredEnv('PAYMENT_MERCHANT_BANK_DISPLAY_NAME'),
    },
    close: async () => {
      await evidence.close();
      await world.close();
      await runtime.close();
    },
  };
}

/** The derived transfer reference `APP7-G01` locks: `ORD` + code body + `DC`. */
export function expectedTransferReference(orderCode: string): string {
  const body = orderCode
    .replace(/^ORD-?/i, '')
    .replace(/-/g, '')
    .toUpperCase();
  return `ORD${body}DC`;
}

/**
 * Converts one approved hand-off through the real `design.approved` consumer.
 *
 * The outbox row is the one `APP6-B11` writes; the claim, the lease, the
 * transaction and the completion are the production runtime's. Returns the
 * order the conversion created, read back through the evidence pool.
 */
export async function convertApprovedDesign(app7: App7World, handoff: any): Promise<any> {
  await app7.world.appendDesignApproved(handoff);
  await app7.control.drainJobs();
  const orders = await app7.evidence.listOrdersForRequest(handoff.customRequestId);
  expect(orders).toHaveLength(1);
  return orders[0];
}

/**
 * One same-origin API call, issued **from inside the browser**.
 *
 * Not `request.newContext()`, and not `browserContext.request`: both of those
 * are Playwright's Node-side client, and this run addresses the gateway by its
 * real hostname (`*.localhost`), which only Chromium resolves here — it is
 * launched with `--host-resolver-rules`, and the platform's resolver has no
 * entry. Pinning `127.0.0.1` instead would take the gateway's hostname routing
 * out of the path, which is one of the things these cases are asserting.
 *
 * Issuing from the page is also the more truthful client: the request travels
 * the same origin, the same gateway and — on the Admin origin — the same real
 * session cookie the login produced. Nothing is injected.
 */
export async function apiJson(
  page: Page,
  path: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: any }> {
  const result = await page.evaluate(
    async ([target, spec]: [string, typeof init]) => {
      const response = await fetch(target, {
        method: spec.method,
        credentials: 'same-origin',
        headers: {
          ...(spec.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(spec.headers ?? {}),
        },
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      });
      return { status: response.status, text: await response.text() };
    },
    [path, init] as [string, typeof init],
  );
  return {
    status: result.status,
    body: result.text === '' ? undefined : JSON.parse(result.text),
  };
}

/** The same call, for an operation that answers with bytes. Returns a Buffer. */
export async function apiBinary(
  page: Page,
  path: string,
  init: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; contentType: string; bytes: Buffer }> {
  const result = await page.evaluate(
    async ([target, spec]: [string, { method: string; body?: unknown }]) => {
      const response = await fetch(target, {
        method: spec.method,
        credentials: 'same-origin',
        ...(spec.body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec.body) }),
      });
      const buffer = await response.arrayBuffer();
      let binary = '';
      for (const byte of new Uint8Array(buffer)) {
        binary += String.fromCharCode(byte);
      }
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        base64: btoa(binary),
      };
    },
    [path, init] as [string, { method: string; body?: unknown }],
  );
  return {
    status: result.status,
    contentType: result.contentType,
    bytes: Buffer.from(result.base64, 'base64'),
  };
}

/**
 * An Admin browsing context, logged in through the real form.
 *
 * Returned with its own `request`, so the API-level cases below carry the same
 * real session cookie the browser journeys do — no cookie is injected and no
 * guard is bypassed.
 */
export async function openAdminSession(
  browser: Browser,
  adminBaseUrl: string,
): Promise<{ page: Page; request: APIRequestContext; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: adminBaseUrl });
  const page = await context.newPage();
  const { loginAsAdmin } = await import('../../app1/support/admin-auth');
  await loginAsAdmin(page, {
    email: requiredEnv('E2E_ADMIN_EMAIL'),
    password: requiredEnv('E2E_ADMIN_PASSWORD'),
    displayName: requiredEnv('E2E_ADMIN_DISPLAY_NAME'),
  });
  return {
    page,
    request: context.request,
    close: () => context.close(),
  };
}

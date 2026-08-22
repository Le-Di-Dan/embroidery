/**
 * `APP6-E01-06` — the customer-safe contract surface and the APP7 boundary.
 *
 * Two authorities, deliberately both:
 *
 * 1. **Static.** The committed `openapi.generated.json` is read as-is — never
 *    regenerated — and every APP6 customer request and response schema is walked
 *    transitively through its `$ref`s. A forbidden internal cannot hide behind a
 *    component boundary that way, and the proof holds for every client generated
 *    from that document, not just for the responses this run happened to trigger.
 * 2. **Runtime.** The same claims are then made against real bodies from a real
 *    journey, because a published contract that the application overshoots would
 *    pass a static check alone.
 *
 * The APP7 boundary is asserted both ways too: no APP6 schema names an Order,
 * payment, reservation or production artifact, and a completed journey creates
 * none.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';

import {
  catalogDocument,
  createApp6AcceptanceContext,
  shapeAt,
  type App6AcceptanceContext,
  type SeededCommission,
} from './app6-e01-context';
import { createJourneyDriver, dataOf, pricingAt, type JourneyDriver } from './app6-e01-journey';

const SOURCE = '203.0.113.61';

/** The published counts `APP6-S02` froze. This case reads; it never regenerates. */
const PUBLISHED = { paths: 72, operations: 79, schemas: 167 } as const;

/** The six customer-facing APP6 operations, by published path. */
const CUSTOMER_PATHS = [
  '/api/public/quotations/current',
  '/api/public/quotations/accept',
  '/api/public/quotations/reject',
  '/api/public/design-reviews/current',
  '/api/public/design-reviews/approve',
  '/api/public/design-reviews/request-revision',
] as const;

/**
 * Property names no APP6 customer contract may carry, lower-cased.
 *
 * `token` is absent from this list on purpose: it is a legitimate **request**
 * field and the only way a secure link is presented. It is checked separately,
 * against responses only, where echoing it back would put a live credential in a
 * body that gets cached, logged and screenshotted.
 */
const FORBIDDEN_PROPERTY_FRAGMENTS = [
  'tokenhash',
  'tokendigest',
  'digest',
  'pepper',
  'grantid',
  'scopekind',
  'challengeid',
  'stepupchallenge',
  'customerid',
  'adminid',
  'actorid',
  'storagekey',
  'bucket',
  'presigned',
  'objectkey',
  'privateoriginal',
  'auditid',
  'auditevent',
  'outbox',
  'eventpayload',
  'paymentattempt',
  'paymentobligation',
  'orderid',
  'ordercode',
  'reservationid',
  'productionjob',
  'productionspec',
  'machinefile',
] as const;

interface OpenApiDocument {
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
  readonly components: { readonly schemas: Record<string, unknown> };
}

interface OpenApiOperation {
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * Reads the committed artifact from the contracts package.
 *
 * By path from this file rather than through module resolution: the document is
 * a **data file** and `@embroidery/contracts` publishes no subpath export for
 * it, so resolving it as a module would be resolving something the package does
 * not offer. Read-only, and never regenerated — this checkpoint has no authority
 * to change the published contract.
 */
const PUBLISHED_DOCUMENT_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'contracts',
  'openapi',
  'openapi.generated.json',
);

function loadPublishedDocument(): OpenApiDocument {
  return JSON.parse(readFileSync(PUBLISHED_DOCUMENT_PATH, 'utf8')) as OpenApiDocument;
}

/**
 * Every property name reachable from `node`, following `$ref` into components.
 *
 * Cycles are bounded by the visited-ref set — `DesignElement` is recursive, and
 * a walker without one would not terminate on it.
 */
function reachableProperties(
  document: OpenApiDocument,
  node: unknown,
  seenRefs: Set<string>,
  collected: Set<string>,
): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) reachableProperties(document, entry, seenRefs, collected);
    return;
  }
  const record = node as Record<string, unknown>;

  const ref = record['$ref'];
  if (typeof ref === 'string') {
    if (seenRefs.has(ref)) return;
    seenRefs.add(ref);
    const name = ref.replace('#/components/schemas/', '');
    reachableProperties(document, document.components.schemas[name], seenRefs, collected);
    return;
  }

  const properties = record['properties'];
  if (properties !== null && typeof properties === 'object') {
    for (const key of Object.keys(properties)) collected.add(key);
  }
  for (const value of Object.values(record)) {
    reachableProperties(document, value, seenRefs, collected);
  }
}

/** Resolves a `$ref` chain to the schema object it names. */
function resolveSchema(document: OpenApiDocument, node: unknown): Record<string, unknown> {
  let current = node;
  for (let hop = 0; hop < 10; hop += 1) {
    const record = current as Record<string, unknown>;
    const ref = record?.['$ref'];
    if (typeof ref !== 'string') break;
    current = document.components.schemas[ref.replace('#/components/schemas/', '')];
  }
  return (current ?? {}) as Record<string, unknown>;
}

describe('APP6-E01-06 — customer-safe contracts and the APP7 boundary', () => {
  let context: App6AcceptanceContext;
  let journey: JourneyDriver;
  let document: OpenApiDocument;
  let commission: SeededCommission;
  let quotationBody: unknown;
  let reviewBody: unknown;

  beforeAll(async () => {
    document = loadPublishedDocument();
    context = await createApp6AcceptanceContext('app6-e01-06-contracts');
    journey = createJourneyDriver(
      () => context.server(),
      () => context.adminCookie(),
      SOURCE,
    );
    await context.reset();
    await context.publishDeliveredPolicies();
    commission = await context.seedCommission();

    // One complete journey, so the runtime half asserts against real bodies.
    const drafted = await journey
      .createQuotation(commission.requestId, pricingAt(150_000))
      .expect(201);
    const quote = dataOf<{ readonly quotationId: string; readonly versionId: string }>(drafted);
    await journey.sendQuotation(quote.quotationId, quote.versionId).expect(200);
    quotationBody = (await journey.readQuotation(commission.token, SOURCE).expect(200)).body;

    await context.addStepUp(commission);
    await journey.acceptQuotation(commission.token, quote.versionId, SOURCE).expect(200);
    await journey.startDigitizing(commission.requestId).expect(200);
    const authored = await journey
      .authorDesignVersion(commission.requestId, {
        document: catalogDocument(commission.placement!, [shapeAt('elm-1', 120, 170, 200, 120)]),
      })
      .expect(201);
    const versionId = dataOf<{ readonly version: { readonly versionId: string } }>(authored).version
      .versionId;
    await journey.sendDesignVersion(commission.requestId, versionId).expect(200);
    reviewBody = (await journey.readReview(commission.token, SOURCE).expect(200)).body;
  }, 240_000);

  afterAll(async () => {
    await context.close();
  });

  it('reads the committed artifact unchanged: 72 paths, 79 operations, 167 schemas', () => {
    const paths = Object.keys(document.paths);
    const operations = paths.flatMap((path) =>
      Object.keys(document.paths[path]!).filter((method) =>
        (HTTP_METHODS as readonly string[]).includes(method),
      ),
    );
    expect(paths).toHaveLength(PUBLISHED.paths);
    expect(operations).toHaveLength(PUBLISHED.operations);
    expect(Object.keys(document.components.schemas)).toHaveLength(PUBLISHED.schemas);
    // All six customer operations are present and published as POST.
    for (const path of CUSTOMER_PATHS) {
      expect(document.paths[path]?.post).toBeDefined();
    }
  });

  it('no APP6 customer contract exposes an internal identifier or storage locator', () => {
    const offenders: string[] = [];
    for (const path of CUSTOMER_PATHS) {
      const operation = document.paths[path]!.post!;
      const properties = new Set<string>();
      reachableProperties(document, operation.requestBody, new Set(), properties);
      reachableProperties(document, operation.responses, new Set(), properties);

      for (const property of properties) {
        const normalized = property.toLowerCase().replace(/[^a-z]/g, '');
        for (const fragment of FORBIDDEN_PROPERTY_FRAGMENTS) {
          if (normalized.includes(fragment)) offenders.push(`${path}: ${property}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the token is a request field only and is never published on a response', () => {
    for (const path of CUSTOMER_PATHS) {
      const operation = document.paths[path]!.post!;
      const responseProperties = new Set<string>();
      reachableProperties(document, operation.responses, new Set(), responseProperties);
      expect([...responseProperties].map((name) => name.toLowerCase())).not.toContain('token');
    }
  });

  it('money stays string authority across every customer amount', () => {
    const quotation = document.components.schemas['CustomerQuotationResponse'] as Record<
      string,
      unknown
    >;
    const properties = quotation['properties'] as Record<string, unknown>;
    const amounts = Object.keys(properties).filter((name) => name.endsWith('Amount'));
    expect(amounts.length).toBeGreaterThan(0);
    for (const name of amounts) {
      expect((properties[name] as Record<string, unknown>)['type']).toBe('string');
    }
    // The runtime bodies agree with the contract.
    const view = (quotationBody as { readonly data: Record<string, unknown> }).data;
    for (const name of amounts) {
      expect(typeof view[name]).toBe('string');
    }
    expect(view['totalAmount']).toBe('3650000.00');
  });

  it('the review contract carries the governed DesignDocument and customer-safe terms', () => {
    const review = document.components.schemas['CustomerDesignReviewResponse'] as Record<
      string,
      unknown
    >;
    const properties = review['properties'] as Record<string, unknown>;

    // The document is published as the governed schema, not as a free-form blob
    // and not as a second definition of the same thing.
    expect(JSON.stringify(properties['document'])).toContain('#/components/schemas/DesignDocument');
    expect(document.components.schemas['DesignDocument']).toBeDefined();

    const agreement = resolveSchema(document, properties['agreements']);
    const agreementItem = resolveSchema(document, agreement['items']);
    const agreementProperties = agreementItem['properties'] as Record<string, unknown>;
    expect((agreementProperties['content'] as Record<string, unknown>)['type']).toBe('string');
    expect((agreementProperties['contentHash'] as Record<string, unknown>)['type']).toBe('string');
    // The terms carry no author, no admin and no internal agreement id.
    expect(Object.keys(agreementProperties)).toEqual(
      expect.arrayContaining(['agreementVersionId', 'agreementType', 'contentHash', 'content']),
    );
    expect(Object.keys(agreementProperties)).not.toContain('agreementId');
    expect(Object.keys(agreementProperties)).not.toContain('createdByAdminId');
  });

  it('the real customer bodies carry no internal value either', () => {
    const bodies = [JSON.stringify(quotationBody), JSON.stringify(reviewBody)];
    for (const body of bodies) {
      expect(body).not.toContain(commission.token);
      expect(body).not.toContain(commission.grantId);
      expect(body).not.toContain(commission.customerId);
      expect(body).not.toContain(commission.requestId);
      expect(body).not.toContain(commission.contactValue);
      expect(body.toLowerCase()).not.toContain('storage');
      expect(body.toLowerCase()).not.toContain('bucket');
      expect(body.toLowerCase()).not.toContain('x-amz');
    }
  });

  it('no APP6 contract mentions an Order, payment, reservation or production artifact', () => {
    const app6Paths = Object.keys(document.paths).filter(
      (path) =>
        path.includes('/quotations') ||
        path.includes('/design-reviews') ||
        path.includes('/design-versions') ||
        path.includes('/submitted-design'),
    );
    expect(app6Paths.length).toBeGreaterThan(0);

    const forbidden = ['orderid', 'ordercode', 'paymentattempt', 'reservationid', 'productionjob'];
    const offenders: string[] = [];
    for (const path of app6Paths) {
      for (const method of HTTP_METHODS) {
        const operation = document.paths[path]![method];
        if (operation === undefined) continue;
        const properties = new Set<string>();
        reachableProperties(document, operation.requestBody, new Set(), properties);
        reachableProperties(document, operation.responses, new Set(), properties);
        for (const property of properties) {
          const normalized = property.toLowerCase().replace(/[^a-z]/g, '');
          if (forbidden.some((fragment) => normalized.includes(fragment))) {
            offenders.push(`${path} ${method}: ${property}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the completed journey created nothing APP7 owns', async () => {
    for (const table of [
      'orders',
      'order_items',
      'payment_attempts',
      'payment_obligations',
      'inventory_reservations',
      'inventory_soft_holds',
      'production_jobs',
      'production_specifications',
      'production_artifacts',
    ]) {
      expect(await context.count(sql.raw(`select count(*)::text as count from ${table}`))).toBe(0);
    }
  });
});

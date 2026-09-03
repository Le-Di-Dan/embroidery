/**
 * The published shape of the obligation an Admin payment read reports as
 * currently collected (`APP12-A02-C1`).
 *
 * A suite of its own beside `admin-payment.contract.spec.ts`, on the same
 * split as the schema it covers. What it asserts is the property that made the
 * Ready-Made Admin branch buildable at all: the read publishes **which** kind
 * it is collecting rather than assuming a deposit, and it is allowed to report
 * that there is nothing to collect yet.
 *
 * Docker-free: the document is built in process, so this runs before the
 * generation slot is spent.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

interface SchemaShape {
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaShape>;
  readonly enum?: readonly string[];
  readonly type?: string;
}
interface OpenApiShape {
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

describe('APP12-A02-C1 — the published Admin obligation contract', () => {
  let app: INestApplication;
  let document: OpenApiShape;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    previousUrl = process.env['DATABASE_URL'];
    ensureGenerationEnvironment();
    app = await createApiApplication({ logger: false });
    document = buildOpenApiDocument(app) as unknown as OpenApiShape;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previousUrl;
  });

  function schemaOf(name: string): SchemaShape {
    const schema = document.components.schemas[name];
    expect(schema).toBeDefined();
    return schema as SchemaShape;
  }
  it('names the current obligation’s properties exactly', () => {
    expect(Object.keys(schemaOf('AdminPaymentObligationResponse').properties ?? {}).sort()).toEqual(
      [
        'expectedAmount',
        'expectedCurrencyCode',
        'expectedTransferReference',
        'kind',
        'obligationId',
        'satisfiedAt',
        'satisfiedByAttemptId',
        'status',
      ],
    );
    expect(schemaOf('AdminPaymentObligationResponse').properties?.['kind']?.enum).toEqual([
      'DEPOSIT',
      'REMAINING',
      'FULL',
    ]);
  });

  it('makes the current obligation optional and origin required', () => {
    const required = [...(schemaOf('AdminOrderPaymentsResponse').required ?? [])];
    expect(required).toContain('origin');
    // Absent when a Ready-Made order is still unpriced (`BR-029`). Requiring
    // it would force the server to fabricate a provisional obligation — a
    // zero amount and a transfer reference for money nobody may send yet —
    // or to answer 404 for an order that plainly exists, which is what it did
    // before this correction.
    expect(required).not.toContain('currentObligation');
    // The attempt and reconciliation lists stay required and arrive empty, so
    // a consumer never has to distinguish "absent" from "none".
    expect(required).toContain('attempts');
    expect(required).toContain('reconciliations');
    expect(schemaOf('AdminOrderPaymentsResponse').properties?.['origin']?.enum).toEqual([
      'CUSTOM',
      'READY_MADE',
    ]);
  });
});

/**
 * The published `APP6-B01` surface, read from the **committed** artifacts.
 *
 * It reads `openapi.generated.json` and the generated client rather than
 * building a document in memory, because the contract a client consumes is the
 * committed one. It must therefore run after generation.
 *
 * Three things are proved, and two of them are absences:
 *
 * 1. the **write** surface is exactly two operations — a third APP6 mutation
 *    added later without its own checkpoint fails here;
 * 2. every money field is a `string` in the document *and* in the generated
 *    client, so the exact-money rule survives the whole contract path;
 * 3. nothing derived, and no operator identity, is accepted from a client.
 *
 * `APP6-B02` added two `GET`s to the same resource family. This file was
 * narrowed to the mutations it owns rather than widened to count them: the
 * B01 claim is "drafting publishes two operations and no third", and it stays
 * true and stays checkable here. The size of the whole `adminQuotation` family
 * is asserted once, by the newest checkpoint that changed it
 * (`admin-quotation-version.contract.spec.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AdminQuotationController } from './admin-quotation.controller';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';

type Operation = {
  readonly operationId?: string;
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
};
type Schema = {
  readonly type?: string;
  readonly properties?: Record<string, Schema>;
  readonly items?: Schema;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
};

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const document = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

const generatedClient = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.schemas.ts'),
  'utf8',
);

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const WRITE_METHODS: readonly string[] = ['post', 'put', 'patch', 'delete'];

/**
 * Every **drafting** mutation published under the quotation resource family.
 *
 * `APP6-B03` added the send, which is a mutation on this family but not one of
 * this checkpoint's: it answers `200`, carries no body and has its own contract
 * suite. Excluding it by path keeps these assertions about the two operations
 * the Product Owner accepted here, rather than silently widening to whatever the
 * family grows into.
 */
function quotationOperations(): { method: string; path: string; operationId: string }[] {
  const found: { method: string; path: string; operationId: string }[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!(HTTP_METHODS as readonly string[]).includes(method)) {
        continue;
      }
      // Scoped to `/api/admin/quotations`, which is this file's subject. It read
      // `path.includes('quotation')` until `APP6-B04` published
      // `POST /api/public/quotations/current` and `APP6-B05` published the two
      // customer decisions — three operations in a different published domain,
      // behind a different credential, that this Admin surface has never made a
      // claim about. Leaving the wider predicate in place did not make the
      // assertion stronger: it made it fail for a reason it was not written to
      // detect, while saying nothing about the Admin routes it exists to freeze.
      if (
        path.startsWith('/api/admin/quotations') &&
        WRITE_METHODS.includes(method) &&
        !path.endsWith('/send')
      ) {
        found.push({ method, path, operationId: operation.operationId ?? '' });
      }
    }
  }
  return found;
}

/** Every money-ish leaf property name reachable from a schema. */
function moneyLeaves(schema: Schema, seen = new Set<Schema>()): [string, Schema][] {
  if (seen.has(schema)) {
    return [];
  }
  seen.add(schema);
  const leaves: [string, Schema][] = [];
  if (schema.items !== undefined) {
    leaves.push(...moneyLeaves(schema.items, seen));
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    if (/Amount$|Percent$|Price$/.test(name)) {
      leaves.push([name, property]);
    }
    leaves.push(...moneyLeaves(property, seen));
  }
  return leaves;
}

const APP6_SCHEMAS = [
  'CreateQuotationDraftBody',
  'AddQuotationVersionBody',
  'QuotationDraftedResponse',
];

describe('APP6-B01 published surface', () => {
  it('publishes exactly two quotation mutations', () => {
    const operations = quotationOperations();

    expect(operations).toHaveLength(2);
    expect(
      operations.map((operation) => `${operation.method.toUpperCase()} ${operation.path}`),
    ).toEqual(['POST /api/admin/quotations', 'POST /api/admin/quotations/{quotationId}/versions']);
    expect(operations.map((operation) => operation.operationId)).toEqual([
      'adminQuotation_create',
      'adminQuotation_addVersion',
    ]);
  });

  it('publishes the accept and reject as one route each, and neither on this controller', () => {
    // Narrowed exactly as the `/send` assertion below was narrowed when
    // `APP6-B03` landed, and for the same reason: the original blanket refusal
    // was true until `APP6-B05` delivered `TR-LC12-03` and `TR-LC12-06`. The
    // property worth keeping is that **drafting** still cannot decide — one
    // accept and one reject exist, both are customer routes behind a secure-link
    // token, and neither is reachable from this Admin controller.
    const decisions = Object.keys(document.paths).filter((path) =>
      /quotations\/(accept|reject)$/.test(path),
    );
    expect(decisions.sort()).toEqual([
      '/api/public/quotations/accept',
      '/api/public/quotations/reject',
    ]);
    for (const path of decisions) {
      expect(path.startsWith('/api/admin/')).toBe(false);
    }

    // `status` and `expire` remain forbidden outright: no checkpoint has
    // delivered either, and a generic state-mutation route is exactly what
    // `APP6-B05` §4 refuses to publish.
    for (const path of Object.keys(document.paths)) {
      expect(path).not.toMatch(/quotations.*\/(status|expire)/);
    }
  });

  it('publishes the send as exactly one route, and only APP6-B03 owns it', () => {
    // The original assertion here forbade `/send` outright, which was true until
    // `APP6-B03` delivered `TR-LC12-02`. It is narrowed rather than deleted: the
    // property worth keeping is that drafting still cannot send — one send
    // exists, it is not on this controller, and acceptance still has no route.
    const sends = Object.keys(document.paths).filter((path) => /quotations.*\/send$/.test(path));

    expect(sends).toEqual(['/api/admin/quotations/{quotationId}/versions/{versionId}/send']);
    expect(quotationOperations().map((operation) => operation.operationId)).not.toContain(
      'adminQuotation_sendVersion',
    );
  });

  it('answers both operations with an error contract for every refusal it can give', () => {
    for (const { path, method } of quotationOperations()) {
      const responses = Object.keys(document.paths[path]![method]!.responses ?? {});
      expect(responses).toEqual(
        expect.arrayContaining(['201', '400', '401', '403', '404', '409', '415', '503']),
      );
    }
  });
});

describe('APP6-B01 exact money in the contract', () => {
  it.each(APP6_SCHEMAS)('publishes every money field of %s as a string', (name) => {
    const schema = document.components.schemas[name];
    expect(schema).toBeDefined();

    const leaves = moneyLeaves(schema!);
    expect(leaves.length).toBeGreaterThan(0);
    for (const [field, property] of leaves) {
      expect([name, field, property.type]).toEqual([name, field, 'string']);
    }
  });

  it('types every money field of the generated client as a string', () => {
    for (const field of [
      'subtotalAmount',
      'totalAmount',
      'depositAmount',
      'remainingAmount',
      'shippingFeeAmount',
      'manualAdjustmentAmount',
      'depositPercent',
      'unitPriceAmount',
    ]) {
      expect(generatedClient).toMatch(new RegExp(`${field}\\??: string;`));
      // The failure this rules out: Orval typing an amount `number` because the
      // document published one.
      expect(generatedClient).not.toMatch(new RegExp(`${field}\\??: number;`));
    }
  });
});

describe('APP6-B01 accepts no derived or authoritative field', () => {
  const bodies = ['CreateQuotationDraftBody', 'AddQuotationVersionBody'];

  it.each(bodies)('%s accepts no operator or customer identity', (name) => {
    const properties = Object.keys(document.components.schemas[name]?.properties ?? {});

    for (const forbidden of ['adminId', 'customerId', 'actorKind', 'createdByAdminId']) {
      expect(properties).not.toContain(forbidden);
    }
  });

  it.each(bodies)('%s accepts no figure the server derives', (name) => {
    const properties = Object.keys(document.components.schemas[name]?.properties ?? {});

    for (const derived of [
      'subtotalAmount',
      'totalAmount',
      'depositAmount',
      'remainingAmount',
      'depositPercent',
      'code',
      'version',
      'status',
      'currencyCode',
      'validUntil',
      'sentAt',
    ]) {
      expect(properties).not.toContain(derived);
    }
  });

  it.each(bodies)('%s is closed, so an unknown key is refused rather than ignored', (name) => {
    expect(document.components.schemas[name]?.additionalProperties).toBe(false);
  });

  it('accepts no line total: a line total is its unit price times its quantity', () => {
    const line =
      document.components.schemas['CreateQuotationDraftBody']?.properties?.['lineItems']?.items;

    expect(Object.keys(line?.properties ?? {})).not.toContain('lineTotalAmount');
    expect(Object.keys(line?.properties ?? {})).toEqual(
      expect.arrayContaining(['lineKind', 'description', 'quantity', 'unitPriceAmount']),
    );
  });
});

describe('APP6-B01 guard composition', () => {
  function guardsOn(handler: string | undefined): unknown[] {
    const target =
      handler === undefined
        ? AdminQuotationController
        : (AdminQuotationController.prototype as unknown as Record<string, unknown>)[handler];
    return (Reflect.getMetadata('__guards__', target as object) as unknown[] | undefined) ?? [];
  }

  it('protects the controller with the Admin session guard', () => {
    expect(guardsOn(undefined)).toContain(AuthenticatedAdminGuard);
  });

  it.each(['create', 'addVersion'])('adds the origin and JSON body guards to %s', (handler) => {
    const guards = guardsOn(handler);

    expect(guards).toContain(StaffOriginGuard);
    expect(guards).toContain(StaffJsonBodyGuard);
  });

  it('exposes exactly two handlers', () => {
    const handlers = Object.getOwnPropertyNames(AdminQuotationController.prototype).filter(
      (name) => name !== 'constructor',
    );

    expect(handlers.sort()).toEqual(['addVersion', 'create']);
  });
});

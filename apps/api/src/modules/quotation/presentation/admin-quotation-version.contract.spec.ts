/**
 * The published `APP6-B02` read surface, from the **committed** artifacts.
 *
 * It reads `openapi.generated.json` and the generated client rather than
 * building a document in memory, because the contract a client consumes is the
 * committed one. It must therefore run after generation.
 *
 * Four things are proved, and two of them are absences:
 *
 * 1. the reads are **exactly two** operations, under the accepted
 *    `adminQuotation` id family, and the whole family is four — so a fifth APP6
 *    route added later without its own checkpoint fails here;
 * 2. every money field is a `string` in the document *and* in the generated
 *    client, so the exact-money rule survives the whole contract path;
 * 3. every nullable field publishes a real scalar type, so the generated client
 *    says `string | null` rather than inheriting the `type: object` debt older
 *    schemas in this repository carry;
 * 4. the reads carry mutation guards nowhere, and answer with no conflict code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AdminQuotationVersionController } from './admin-quotation-version.controller';
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
  readonly nullable?: boolean;
  readonly properties?: Record<string, Schema>;
  readonly items?: Schema;
  readonly $ref?: string;
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

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

const READ_SCHEMAS = [
  'AdminQuotationVersionHistoryResponse',
  'AdminQuotationVersionDetailResponse',
  'AdminQuotationHeaderResponse',
  'AdminQuotationVersionResponse',
  'AdminQuotationLineItemResponse',
];

function quotationOperations(
  filter: (method: string) => boolean = () => true,
): { method: string; path: string; operationId: string }[] {
  const found: { method: string; path: string; operationId: string }[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!(HTTP_METHODS as readonly string[]).includes(method) || !path.includes('quotation')) {
        continue;
      }
      if (filter(method)) {
        found.push({ method, path, operationId: operation.operationId ?? '' });
      }
    }
  }
  return found;
}

/** Every property reachable from a schema, `$ref`s followed, by leaf name. */
function properties(schema: Schema, seen = new Set<string>()): [string, Schema][] {
  const found: [string, Schema][] = [];
  if (schema.$ref !== undefined) {
    const name = schema.$ref.replace('#/components/schemas/', '');
    if (seen.has(name)) {
      return found;
    }
    seen.add(name);
    const target = document.components.schemas[name];
    return target === undefined ? found : properties(target, seen);
  }
  if (schema.items !== undefined) {
    found.push(...properties(schema.items, seen));
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    found.push([name, property]);
    found.push(...properties(property, seen));
  }
  return found;
}

describe('APP6-B02 published read surface', () => {
  it('publishes exactly two quotation reads', () => {
    const reads = quotationOperations((method) => method === 'get');

    expect(reads.map((read) => `${read.method.toUpperCase()} ${read.path}`)).toEqual([
      'GET /api/admin/quotations/{quotationId}/versions',
      'GET /api/admin/quotations/{quotationId}/versions/{versionId}',
    ]);
    expect(reads.map((read) => read.operationId)).toEqual([
      'adminQuotation_versionHistory',
      'adminQuotation_versionDetail',
    ]);
  });

  it('keeps the whole quotation family at five operations under one id domain', () => {
    const family = quotationOperations();

    // Two drafting mutations from `APP6-B01`, two reads from `APP6-B02`, one
    // send from `APP6-B03`. An accept or a customer surface arriving without its
    // own checkpoint fails here rather than in review.
    expect(family).toHaveLength(5);
    for (const operation of family) {
      expect(operation.operationId).toMatch(/^adminQuotation_/);
    }
  });

  it('leaves the two accepted APP6-B01 operation ids untouched', () => {
    // `APP6-B03`'s send is a third POST in the same published domain and is
    // excluded here rather than appended: this assertion exists to prove the two
    // *accepted* ids survive, and its own surface is proved by
    // `admin-quotation-send.contract.spec.ts`.
    const ids = quotationOperations((method) => method === 'post')
      .filter((operation) => !operation.path.endsWith('/send'))
      .map((operation) => operation.operationId);

    // The read controller is a second class in the same published domain, and
    // `CONTROLLER_DOMAIN_KEYS` is what stops that split from renaming these.
    expect(ids).toEqual(['adminQuotation_create', 'adminQuotation_addVersion']);
  });

  it('accepts no request body on either read', () => {
    for (const { path, method } of quotationOperations((m) => m === 'get')) {
      expect(document.paths[path]![method]!.requestBody).toBeUndefined();
    }
  });

  it('answers each read with only the statuses a read can give', () => {
    for (const { path, method } of quotationOperations((m) => m === 'get')) {
      const statuses = Object.keys(document.paths[path]![method]!.responses ?? {});

      expect(statuses).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
      // A read has no conflict, no unsupported media type and no unavailable
      // policy: those are answers the drafting mutations give.
      expect(statuses).not.toContain('409');
      expect(statuses).not.toContain('415');
      expect(statuses).not.toContain('503');
    }
  });
});

describe('APP6-B02 exact money in the contract', () => {
  it.each(READ_SCHEMAS)('publishes every money field of %s as a string', (name) => {
    const schema = document.components.schemas[name];
    expect(schema).toBeDefined();

    for (const [field, property] of properties(schema!)) {
      if (/Amount$|Percent$|Price$/.test(field)) {
        expect([name, field, property.type]).toEqual([name, field, 'string']);
      }
    }
  });

  it('finds money to check in every schema that should carry it', () => {
    // Guards the loop above against passing vacuously — a schema that lost its
    // amounts entirely would otherwise satisfy "every amount is a string".
    const counted = Object.fromEntries(
      READ_SCHEMAS.map((name) => [
        name,
        properties(document.components.schemas[name]!).filter(([field]) =>
          /Amount$|Percent$|Price$/.test(field),
        ).length,
      ]),
    );

    // The header addresses a quotation; it prices nothing, so it carries no
    // amount at all and that is the contract rather than an omission.
    expect(counted['AdminQuotationHeaderResponse']).toBe(0);
    expect(counted['AdminQuotationVersionResponse']).toBe(7);
    expect(counted['AdminQuotationLineItemResponse']).toBe(2);
    // Both envelopes reach the amounts through their nested schemas.
    expect(counted['AdminQuotationVersionHistoryResponse']).toBeGreaterThan(0);
    expect(counted['AdminQuotationVersionDetailResponse']).toBeGreaterThan(0);
  });

  it('types every money field of the generated read types as a string', () => {
    for (const field of [
      'subtotalAmount',
      'manualAdjustmentAmount',
      'shippingFeeAmount',
      'totalAmount',
      'depositPercent',
      'depositAmount',
      'remainingAmount',
      'unitPriceAmount',
      'lineTotalAmount',
    ]) {
      expect(generatedClient).toMatch(new RegExp(`${field}\\??: string;`));
      // The failure this rules out: Orval typing an amount `number` because the
      // document published one.
      expect(generatedClient).not.toMatch(new RegExp(`${field}\\??: number;`));
    }
  });
});

describe('APP6-B02 nullable fields state a real type', () => {
  it.each(READ_SCHEMAS)('publishes no nullable %s property as an object', (name) => {
    for (const [field, property] of properties(document.components.schemas[name]!)) {
      if (property.nullable === true) {
        // `nullable: true` with no explicit `type` publishes `type: object`,
        // which Orval turns into an index signature — the debt this checkpoint
        // was told not to add to.
        expect([field, property.type]).not.toEqual([field, 'object']);
        expect(['string', 'number', 'boolean', 'integer']).toContain(property.type);
      }
    }
  });

  it('types every optional historical fact as a union in the generated client', () => {
    for (const field of [
      'adjustmentReason',
      'stitchCount',
      'validFrom',
      'validUntil',
      'sentAt',
      'acceptedAt',
      'supersededAt',
      'expiredAt',
      'currentVersionId',
      'skuId',
    ]) {
      expect(generatedClient).toMatch(new RegExp(`${field}: (string|number) \\| null;`));
    }
  });
});

describe('APP6-B02 guard composition', () => {
  function guardsOn(handler: string | undefined): unknown[] {
    const target =
      handler === undefined
        ? AdminQuotationVersionController
        : (AdminQuotationVersionController.prototype as unknown as Record<string, unknown>)[
            handler
          ];
    return (Reflect.getMetadata('__guards__', target as object) as unknown[] | undefined) ?? [];
  }

  it('protects the controller with the Admin session guard', () => {
    expect(guardsOn(undefined)).toContain(AuthenticatedAdminGuard);
  });

  it.each(['versionHistory', 'versionDetail'])('adds no mutation guard to %s', (handler) => {
    const guards = guardsOn(handler);

    // Both are mutation guards: a JSON body guard has no body to check on a GET,
    // and the origin check protects state-changing requests. Cargo-culting them
    // onto a read would reject a legitimate one.
    expect(guards).not.toContain(StaffOriginGuard);
    expect(guards).not.toContain(StaffJsonBodyGuard);
  });

  it('exposes exactly two handlers', () => {
    const handlers = Object.getOwnPropertyNames(AdminQuotationVersionController.prototype).filter(
      (name) => name !== 'constructor',
    );

    expect(handlers.sort()).toEqual(['versionDetail', 'versionHistory']);
  });
});

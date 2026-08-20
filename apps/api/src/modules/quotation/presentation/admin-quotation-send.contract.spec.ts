/**
 * The published `APP6-B03` send surface, from the **committed** artifacts.
 *
 * It reads `openapi.generated.json` and the generated client rather than
 * building a document in memory, because the contract a client consumes is the
 * committed one. It must therefore run after generation.
 *
 * Five things are proved, and three of them are absences:
 *
 * 1. the send is **exactly one** operation, at the exact path and under the
 *    accepted `adminQuotation` id family, and `APP6-B01`/`APP6-B02`'s four ids
 *    are byte-identical to what the Product Owner accepted;
 * 2. it takes **no request body** — every server-derived fact stays server-
 *    derived because the contract has nowhere to put a client's version of it;
 * 3. no `QUOTED` target, no generic status route and no second resend operation
 *    is published anywhere in the document;
 * 4. it carries the Admin mutation guards, and not the JSON body guard it has no
 *    body for;
 * 5. its money is `string` in the document and in the generated client.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AdminQuotationSendController } from './admin-quotation-send.controller';
import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { CONTROLLER_DOMAIN_KEYS } from '../../../openapi/operation-id';

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
  readonly allOf?: Schema[];
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

const SEND_PATH = '/api/admin/quotations/{quotationId}/versions/{versionId}/send';

/** The four ids the Product Owner accepted at `APP6-B01` and `APP6-B02`. */
const ACCEPTED_IDS = [
  'adminQuotation_create',
  'adminQuotation_addVersion',
  'adminQuotation_versionHistory',
  'adminQuotation_versionDetail',
];

function allOperations(): { method: string; path: string; operationId: string }[] {
  const found: { method: string; path: string; operationId: string }[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if ((HTTP_METHODS as readonly string[]).includes(method)) {
        found.push({ method, path, operationId: operation.operationId ?? '' });
      }
    }
  }
  return found;
}

/**
 * Every property reachable from a schema, `$ref`s followed, by leaf name.
 *
 * `allOf` is followed as well as `$ref`: Nest wraps a referenced class in a
 * single-member `allOf` whenever the property also carries a description, which
 * every referenced property on the send response does. A helper that stopped at
 * `$ref` would walk straight past the version and its line items and then report
 * that every money field it found — none — was a string.
 */
function properties(schema: Schema, seen = new Set<string>()): [string, Schema][] {
  const found: [string, Schema][] = [];
  for (const member of schema.allOf ?? []) {
    found.push(...properties(member, seen));
  }
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

describe('APP6-B03 published send surface', () => {
  it('publishes exactly one send operation, at the version it freezes', () => {
    const sends = allOperations().filter((operation) => operation.path.endsWith('/send'));

    expect(sends).toEqual([
      { method: 'post', path: SEND_PATH, operationId: 'adminQuotation_sendVersion' },
    ]);
  });

  it('keeps the four accepted APP6-B01/B02 operation ids byte-identical', () => {
    const ids = allOperations().map((operation) => operation.operationId);

    for (const accepted of ACCEPTED_IDS) {
      expect(ids).toContain(accepted);
    }
    // The send is a third class in the domain; `CONTROLLER_DOMAIN_KEYS` is what
    // stops that split from reissuing any of the four above.
    expect(CONTROLLER_DOMAIN_KEYS['AdminQuotationSendController']).toBe('adminQuotation');
    expect(ids.filter((id) => id.startsWith('adminQuotation_'))).toHaveLength(5);
  });

  it('accepts no request body', () => {
    // The whole guarantee of §4: the operator identity, the send instant, the
    // validity window, the totals and the target state are server-derived, and
    // there is no field through which a caller could supply one.
    expect(document.paths[SEND_PATH]!['post']!.requestBody).toBeUndefined();
  });

  it('publishes no QUOTED target and no generic quotation status route', () => {
    const operations = allOperations();

    expect(operations.map((operation) => operation.path.toLowerCase())).not.toContainEqual(
      expect.stringContaining('/quoted'),
    );
    // No second way to express the same intent: re-issuing a version replays
    // through the send route itself. Scoped to the quotation family — APP4
    // publishes a verification-challenge resend, which is another domain's
    // accepted surface and not this rule's subject.
    const quotationPaths = operations
      .map((operation) => operation.path)
      .filter((path) => path.includes('quotation'));
    expect(quotationPaths.filter((path) => /resend/i.test(path))).toHaveLength(0);
    expect(quotationPaths.filter((path) => /status/i.test(path))).toHaveLength(0);
  });

  it('answers with the statuses a guarded send can give', () => {
    const statuses = Object.keys(document.paths[SEND_PATH]!['post']!.responses ?? {});

    expect(statuses).toEqual(expect.arrayContaining(['200', '400', '401', '403', '404', '409']));
    // The unpublished-policy refusal, on the APP6-B01 precedent.
    expect(statuses).toContain('503');
    // No body, so no unsupported media type.
    expect(statuses).not.toContain('415');
  });
});

describe('APP6-B03 exact money in the send contract', () => {
  it('publishes every money field of AdminQuotationSentResponse as a string', () => {
    const schema = document.components.schemas['AdminQuotationSentResponse'];
    expect(schema).toBeDefined();

    const money = properties(schema!).filter(([field]) => /Amount$|Percent$|Price$/.test(field));
    // Guards the loop below against passing vacuously: seven on the version,
    // two on each line item, reached through the referenced APP6-B02 schemas.
    expect(money.length).toBeGreaterThanOrEqual(9);

    for (const [field, property] of money) {
      expect([field, property.type]).toEqual([field, 'string']);
    }
  });

  it('publishes no nullable property of the send response as an object', () => {
    for (const [field, property] of properties(
      document.components.schemas['AdminQuotationSentResponse']!,
    )) {
      if (property.nullable === true) {
        expect([field, property.type]).not.toEqual([field, 'object']);
        expect(['string', 'number', 'boolean', 'integer']).toContain(property.type);
      }
    }
  });

  it('types the send response in the generated client without re-declaring a version', () => {
    // It references `APP6-B02`'s accepted types rather than minting a second
    // twenty-field version type the two would have to be kept identical by hand.
    expect(generatedClient).toMatch(/version: AdminQuotationVersionResponse;/);
    expect(generatedClient).toMatch(/lineItems: AdminQuotationLineItemResponse\[\];/);
    expect(generatedClient).toMatch(/requestTransitioned: boolean;/);
    expect(generatedClient).toMatch(/replayed: boolean;/);
  });
});

describe('APP6-B03 guard composition', () => {
  function guardsOn(handler: string | undefined): unknown[] {
    const target =
      handler === undefined
        ? AdminQuotationSendController
        : (AdminQuotationSendController.prototype as unknown as Record<string, unknown>)[handler];
    return (Reflect.getMetadata('__guards__', target as object) as unknown[] | undefined) ?? [];
  }

  it('protects the controller with the Admin session guard', () => {
    expect(guardsOn(undefined)).toContain(AuthenticatedAdminGuard);
  });

  it('carries the CSRF-shaped origin guard on the mutation', () => {
    expect(guardsOn('sendVersion')).toContain(StaffOriginGuard);
  });

  it('adds no JSON body guard, because there is no body', () => {
    expect(guardsOn('sendVersion')).not.toContain(StaffJsonBodyGuard);
  });

  it('exposes exactly one handler', () => {
    const handlers = Object.getOwnPropertyNames(AdminQuotationSendController.prototype).filter(
      (name) => name !== 'constructor',
    );

    expect(handlers).toEqual(['sendVersion']);
  });
});

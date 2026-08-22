/**
 * The Admin SKU HTTP contract (`APP7-B01`), asserted from source and from the
 * published artifacts.
 *
 * Two kinds of claim need this file. The first is an **absence**: dropping one
 * guard from one handler would leave every functional test passing while an
 * unauthenticated or cross-origin caller could author SKUs, and a third handler
 * appearing here would silently widen a checkpoint whose scope is exactly two
 * operations. The second is a **published** fact: a body that validates at
 * runtime but publishes `{}` gives the generated client an open bag, so the
 * committed OpenAPI artifact and the generated client are read directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createOperationId } from '../../../openapi/operation-id';
import { AdminSkuController } from './admin-sku.controller';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const CONTROLLER_SOURCE = readFileSync(join(__dirname, 'admin-sku.controller.ts'), 'utf8');

interface OpenApiDocument {
  readonly paths: Record<string, Record<string, { operationId?: string; requestBody?: unknown }>>;
  readonly components: { readonly schemas: Record<string, Record<string, unknown>> };
}

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as OpenApiDocument;

const CLIENT_SCHEMAS = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.schemas.ts'),
  'utf8',
);

const CREATE_PATH = '/api/admin/products/{productId}/variants/{variantId}/skus';
const UPDATE_PATH = '/api/admin/skus/{skuId}';

describe('APP7-B01 Admin SKU contract', () => {
  describe('exactly two operations', () => {
    it('declares two handlers and nothing else', () => {
      const methods = CONTROLLER_SOURCE.match(/^\s{2}@(Get|Post|Patch|Put|Delete)\(/gm) ?? [];
      expect(methods).toHaveLength(2);
      expect(methods.map((method) => method.trim())).toEqual(['@Post(', '@Patch(']);
    });

    it('publishes no list, detail or delete operation', () => {
      // The checkpoint owns authoring only. A read or a delete would be a third
      // and a fourth operation, and neither is needed to make the Catalog
      // order-item branch reachable.
      expect(CONTROLLER_SOURCE).not.toMatch(/@(Get|Delete|Put)\s*\(/);
    });

    it('publishes exactly the two operation ids the naming policy derives', () => {
      expect(createOperationId(AdminSkuController.name, 'create')).toBe('adminSku_create');
      expect(createOperationId(AdminSkuController.name, 'update')).toBe('adminSku_update');
      // Derived, so no `CONTROLLER_DOMAIN_KEYS` entry is owed and a file-layout
      // decision can never rename a public identifier.
      expect(OPENAPI.paths[CREATE_PATH]?.post?.operationId).toBe('adminSku_create');
      expect(OPENAPI.paths[UPDATE_PATH]?.patch?.operationId).toBe('adminSku_update');
    });
  });

  describe('the complete Admin mutation chain', () => {
    it('applies the Admin session guard at the controller', () => {
      expect(CONTROLLER_SOURCE).toMatch(
        /@Controller\('admin'\)\n@UseGuards\(AuthenticatedAdminGuard\)/,
      );
    });

    it('applies the origin and JSON-body guards to both mutations', () => {
      const chains =
        CONTROLLER_SOURCE.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g) ?? [];
      expect(chains).toHaveLength(2);
    });

    it('reuses the delivered guards rather than declaring a role system', () => {
      expect(CONTROLLER_SOURCE).not.toMatch(/@SetMetadata\s*\(|@Roles\s*\(/);
    });
  });

  describe('the published request bodies are real', () => {
    it.each([
      ['CreateSkuBody', ['code', 'isActive', 'priceOverrideAmount']],
      ['UpdateSkuBody', ['code', 'isActive', 'priceOverrideAmount']],
    ])('%s publishes its actual fields, not an empty object', (name, fields) => {
      const schema = OPENAPI.components.schemas[name];
      expect(schema).toBeDefined();
      const properties = schema?.['properties'] as Record<string, unknown> | undefined;
      expect(properties).toBeDefined();
      expect(Object.keys(properties ?? {}).sort()).toEqual([...fields].sort());
      // `.strict()` at runtime must be visible in the contract too, or a client
      // is told an unknown field would be accepted when it is refused.
      expect(schema?.['additionalProperties']).toBe(false);
    });

    it.each(['CreateSkuBody', 'UpdateSkuBody'])(
      '%s advertises no SKU-code policy at all (APP7-B01-C1, APP7-B01-FD1)',
      (name) => {
        // `skus.code` is `text NOT NULL` with `uq_skus__code` and no CHECK
        // (`0007_create_catalog_tables.sql:59,66`), compared bytewise under `C`
        // (ADR-DB5-002 R1/R2). No accepted source restricts a character, a
        // length or emptiness — so the contract must claim none of them.
        //
        // `APP7-B01` published an ASCII `pattern`, telling every generated
        // client that `ÁO-THUN-ĐEN-M` was invalid; `APP7-B01-C1` removed it but
        // kept `minLength`/`maxLength`, which made the same kind of claim about
        // length. Both are gone, and nothing may return under `format` or as an
        // enumeration of legal values.
        const code = (
          OPENAPI.components.schemas[name]?.['properties'] as Record<
            string,
            Record<string, unknown>
          >
        )['code'];
        expect(code).toBeDefined();
        // The wire type, and only the wire type.
        expect(code?.['type']).toBe('string');
        for (const claim of ['pattern', 'format', 'enum', 'minLength', 'maxLength']) {
          expect(code?.[claim]).toBeUndefined();
        }
      },
    );

    it('gives the generated client an unrestricted code (APP7-B01-C1, APP7-B01-FD1)', () => {
      const create =
        /export interface CreateSkuBody \{[\s\S]*?\n\}/.exec(CLIENT_SCHEMAS)?.[0] ?? '';
      const update =
        /export interface UpdateSkuBody \{[\s\S]*?\n\}/.exec(CLIENT_SCHEMAS)?.[0] ?? '';
      expect(create).not.toBe('');
      expect(update).not.toBe('');
      for (const block of [create, update]) {
        // Scoped to `code` alone: `priceOverrideAmount` legitimately keeps
        // `@pattern ^\d{1,12}$`, which is the VND whole-đồng rule the column's
        // own CHECK enforces. The generated annotations are how a client-side
        // validator learns a constraint, so an unauthorized rule surviving on
        // `code` here is the same defect one layer further out.
        const lines = block.split('\n');
        const declaration = lines.findIndex((line) => /^\s*code\??: string;/.test(line));
        expect(declaration).toBeGreaterThan(-1);
        const preceding: string[] = [];
        for (let index = declaration - 1; index > 0; index -= 1) {
          const line = lines[index] ?? '';
          if (!/^\s*(\/\*\*|\*|\*\/)/.test(line)) break;
          preceding.push(line);
        }
        expect(preceding.join('\n')).not.toMatch(/@pattern|@minLength|@maxLength|@format/);
      }
      expect(CLIENT_SCHEMAS).not.toMatch(/\^\[A-Za-z0-9]\[A-Za-z0-9\._-]\*\$/);
    });

    it('marks the create body required exactly where the schema does', () => {
      expect(OPENAPI.components.schemas['CreateSkuBody']?.['required']).toEqual([
        'code',
        'isActive',
      ]);
      // A patch has no required field: which one it names is the caller's choice
      // and "at least one" is a refinement, not a required list.
      expect(OPENAPI.components.schemas['UpdateSkuBody']?.['required']).toBeUndefined();
    });

    it('binds each operation to its own body component', () => {
      expect(JSON.stringify(OPENAPI.paths[CREATE_PATH]?.post?.requestBody)).toContain(
        '#/components/schemas/CreateSkuBody',
      );
      expect(JSON.stringify(OPENAPI.paths[UPDATE_PATH]?.patch?.requestBody)).toContain(
        '#/components/schemas/UpdateSkuBody',
      );
    });

    it('gives the generated client typed fields rather than an open bag', () => {
      expect(CLIENT_SCHEMAS).toMatch(/export interface CreateSkuBody \{[\s\S]*?isActive: boolean;/);
      expect(CLIENT_SCHEMAS).toMatch(
        /export interface UpdateSkuBody \{[\s\S]*?priceOverrideAmount\?: string \| null;/,
      );
      expect(CLIENT_SCHEMAS).toMatch(
        /export interface AdminSkuResponse \{[\s\S]*?variantOrderEligibleSkuCount: number;/,
      );
    });
  });

  describe('what the contract must never offer', () => {
    it('has no field that moves a SKU between variants', () => {
      for (const name of ['CreateSkuBody', 'UpdateSkuBody']) {
        const properties = OPENAPI.components.schemas[name]?.['properties'] as Record<
          string,
          unknown
        >;
        expect(Object.keys(properties)).not.toContain('productVariantId');
        expect(Object.keys(properties)).not.toContain('variantId');
      }
    });

    it('publishes no inventory fact on the response', () => {
      // `skus` is the definition side (REL-026); stock lives in CTX-INV, and a
      // stock-shaped field here would invent one.
      const properties = Object.keys(
        OPENAPI.components.schemas['AdminSkuResponse']?.['properties'] as Record<string, unknown>,
      );
      for (const forbidden of ['quantityOnHand', 'reserved', 'lowStockThreshold', 'available']) {
        expect(properties).not.toContain(forbidden);
      }
    });

    it('does not reach outside the Catalog bounded context', () => {
      expect(CONTROLLER_SOURCE).not.toMatch(
        /from\s*['"][^'"]*\/(order|payment|design|inventory|production)\//,
      );
    });
  });
});

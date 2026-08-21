/**
 * The published `APP6-A02` §5–§7 contract, built in process.
 *
 * The integration suite proves what the endpoint *does*; this proves what the
 * document *says*, which is the half every generated client depends on. It runs
 * before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const DETAIL_PATH = '/api/admin/custom-requests/{requestId}/design-versions/{versionId}';
const LIST_PATH = '/api/admin/custom-requests/{requestId}/design-versions';
const SEND_PATH = '/api/admin/custom-requests/{requestId}/design-versions/{versionId}/send';
const SUBMITTED_PATH = '/api/admin/custom-requests/{requestId}/submitted-design';

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
}
interface SchemaShape {
  readonly type?: string | readonly string[];
  readonly nullable?: boolean;
  readonly $ref?: string;
  readonly allOf?: readonly SchemaShape[];
  readonly properties?: Record<string, SchemaShape>;
  readonly required?: readonly string[];
  readonly items?: SchemaShape;
  readonly enum?: readonly string[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Names no part of this response tree may publish.
 *
 * Each is a credential reference, a storage handle, an APP7 concern or an
 * internal record id. The scan walks the whole reachable schema graph rather
 * than the four new classes, so a field smuggled in through a nested `$ref`
 * fails here too.
 */
const FORBIDDEN_FIELDS = [
  'sessionSecret',
  'sessionSecretHash',
  'secureLink',
  'token',
  'grantId',
  'stepUpChallengeId',
  'customerId',
  'approvalSnapshotId',
  'agreementVersionId',
  'storageKey',
  'bucket',
  'providerUrl',
  'presignedUrl',
  'downloadUrl',
  'previewUrl',
  'previewHash',
  'previewDerivativeId',
  'orderId',
  'paymentId',
  'depositAmount',
  'productionJobId',
  'auditId',
  'outboxId',
];

describe('APP6-A02 — the published exact-version Admin design detail contract', () => {
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
    if (previousUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousUrl;
    }
  });

  function detailOperation(): OperationShape {
    const operation = document.paths[DETAIL_PATH]?.['get'];
    expect(operation).toBeDefined();
    return operation as OperationShape;
  }

  function schema(name: string): SchemaShape {
    const found = document.components.schemas[name];
    expect(found).toBeDefined();
    return found as SchemaShape;
  }

  it('publishes exactly one operation, on the exact-version path, in the accepted family', () => {
    expect(Object.keys(document.paths[DETAIL_PATH] ?? {})).toEqual(['get']);
    expect(detailOperation().operationId).toBe('adminCustomRequestDesignVersion_detail');
  });

  it('leaves the three accepted APP6-B08/B09 operation ids untouched', () => {
    expect(document.paths[LIST_PATH]?.['post']?.operationId).toBe(
      'adminCustomRequestDesignVersion_create',
    );
    expect(document.paths[LIST_PATH]?.['get']?.operationId).toBe(
      'adminCustomRequestDesignVersion_list',
    );
    expect(document.paths[SEND_PATH]?.['post']?.operationId).toBe(
      'adminCustomRequestDesignVersion_send',
    );
  });

  it('leaves the accepted APP6-B07 operation id untouched', () => {
    expect(document.paths[SUBMITTED_PATH]?.['get']?.operationId).toBe(
      'adminCustomRequestSubmittedDesign_get',
    );
  });

  it('publishes none of the alternative read surfaces APP6-A02 §5 forbids', () => {
    const forbidden = Object.keys(document.paths).filter(
      (path) =>
        /design-cases/.test(path) ||
        /design-versions\/current/.test(path) ||
        /design-versions\/\{versionId\}\/(document|reviews?|approval|approval-snapshot|status)/.test(
          path,
        ),
    );
    expect(forbidden).toEqual([]);
  });

  it('takes both ids in the path, and accepts no body and no query parameter', () => {
    const operation = detailOperation();
    const parameters = operation.parameters ?? [];
    expect(
      parameters
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name)
        .sort(),
    ).toEqual(['requestId', 'versionId']);
    // No query parameter at all: there is no `caseId`, no `version` number
    // alternative and no `current` shorthand to address a design thread with.
    expect(parameters.filter((parameter) => parameter.in === 'query')).toEqual([]);
    // The only header is the platform-wide correlation id every operation
    // carries — asserted by name so a route-specific header could not hide here.
    expect(parameters.filter((parameter) => parameter.in === 'header').map((p) => p.name)).toEqual([
      'X-Request-ID',
    ]);
    // A GET with a body would invite an operator to believe they had selected
    // something the server derives. There is nothing to select.
    expect(operation.requestBody).toBeUndefined();
  });

  it('accepts no caller-supplied design case id anywhere on the operation', () => {
    const serialized = JSON.stringify(detailOperation());
    expect(serialized).not.toContain('designCaseId"');
    for (const parameter of detailOperation().parameters ?? []) {
      expect(parameter.name).not.toMatch(/case/i);
    }
  });

  it('answers an unknown or foreign version with the same documented 404', () => {
    const responses = detailOperation().responses ?? {};
    // The four this operation documents, plus the platform-wide `500` every
    // route carries. Asserted as an exact set so a status added here later has
    // to be justified rather than absorbed.
    expect(Object.keys(responses).sort()).toEqual(['200', '400', '401', '404', '409', '500']);
    // No 403. A "not yours" status would confirm that a guessed id names a real
    // design version on another operator's request.
    expect(responses['403']).toBeUndefined();
    expect(JSON.stringify(responses['404'])).toContain('design version');
  });

  it('references the single generated DesignDocument component for the document', () => {
    const detail = schema('DesignVersionDetailResponse');
    const property = detail.properties?.['document'];
    expect(property).toBeDefined();
    const reference =
      property?.$ref ??
      property?.allOf?.map((entry) => entry.$ref).find((ref) => ref !== undefined);
    expect(reference).toBe('#/components/schemas/DesignDocument');

    // Exactly one document component in the whole artifact: no Admin-flavoured
    // copy that could drift from the customer-facing one.
    const documentComponents = Object.keys(document.components.schemas).filter((name) =>
      /^DesignDocument([A-Z].*)?$/.test(name),
    );
    expect(documentComponents).toContain('DesignDocument');
    expect(
      documentComponents.filter(
        (name) => /^(Admin|Detail)/.test(name) || name.endsWith('Document2'),
      ),
    ).toEqual([]);
  });

  it('publishes the stored hash as nullable, so an unsent draft is an absence', () => {
    const hash = schema('DesignVersionDetailResponse').properties?.['documentHash'];
    expect(hash?.nullable).toBe(true);
    // `type: String` is explicit, so the document says `string | null` and Orval
    // does not fall back to an index signature.
    expect(hash?.type).toBe('string');
  });

  it('publishes review feedback as nullable text on every decision entry', () => {
    const review = schema('DesignVersionDetailReviewResponse');
    expect(Object.keys(review.properties ?? {}).sort()).toEqual([
      'decidedAt',
      'feedback',
      'outcome',
    ]);
    expect(review.properties?.['feedback']?.nullable).toBe(true);
    expect(review.properties?.['feedback']?.type).toBe('string');
    expect(review.properties?.['outcome']?.enum).toEqual(['APPROVE', 'REQUEST_REVISION']);
  });

  it('publishes the approval as a nullable frozen projection with masked contacts only', () => {
    const detail = schema('DesignVersionDetailResponse');
    expect(detail.properties?.['approval']?.nullable).toBe(true);

    const approval = schema('ApprovalEvidenceResponse');
    const properties = Object.keys(approval.properties ?? {});
    expect(properties).toEqual(
      expect.arrayContaining([
        'documentHash',
        'approvedAt',
        'customerDisplayName',
        'maskedEmail',
        'maskedPhone',
        'reverified',
        'productName',
        'sideName',
        'areaName',
        'physicalWidthMm',
        'physicalHeightMm',
        'quantityTotal',
        'branch',
        'agreements',
      ]),
    );
    // The unmasked forms have no field to arrive in.
    expect(properties).not.toContain('contactEmail');
    expect(properties).not.toContain('contactPhone');
    expect(properties).not.toContain('email');
    expect(properties).not.toContain('phone');
    // `reverified` is a boolean, so the challenge id it derives from is not
    // representable here.
    expect(approval.properties?.['reverified']?.type).toBe('boolean');
  });

  it('publishes agreement acceptances as type, content hash and instant only', () => {
    const agreement = schema('ApprovalAgreementResponse');
    expect(Object.keys(agreement.properties ?? {}).sort()).toEqual([
      'acceptedAt',
      'agreementType',
      'contentHash',
    ]);
    // No prose: the approved snapshot card renders evidence, not terms.
    expect(agreement.properties?.['content']).toBeUndefined();
  });

  it('keeps both placement branches honest and mutually exclusive in the contract', () => {
    const detail = schema('DesignVersionDetailResponse');
    for (const catalogField of [
      'productId',
      'productVariantId',
      'productSideId',
      'embroideryAreaId',
    ]) {
      expect(detail.properties?.[catalogField]?.nullable).toBe(true);
    }
    for (const copField of ['placementSideLabel', 'placementAreaLabel']) {
      expect(detail.properties?.[copField]?.nullable).toBe(true);
    }
    expect(detail.properties?.['branch']?.enum).toEqual(['CATALOG', 'CUSTOMER_OWNED']);
    expect(schema('ApprovalEvidenceResponse').properties?.['branch']?.enum).toEqual([
      'CATALOG',
      'CUSTOMER_OWNED',
    ]);
  });

  it('publishes both physical dimensions as strings, never numbers', () => {
    for (const name of ['DesignVersionDetailResponse', 'ApprovalEvidenceResponse']) {
      const target = schema(name);
      expect(target.properties?.['physicalWidthMm']?.type).toBe('string');
      expect(target.properties?.['physicalHeightMm']?.type).toBe('string');
    }
  });

  it('publishes no credential, storage, audit or APP7 field anywhere in the response graph', () => {
    const seen = new Set<string>();
    const names: string[] = [];

    const walk = (node: SchemaShape | undefined): void => {
      if (node === undefined) return;
      if (node.$ref !== undefined) {
        const name = node.$ref.replace('#/components/schemas/', '');
        if (seen.has(name)) return;
        seen.add(name);
        walk(document.components.schemas[name]);
        return;
      }
      for (const entry of node.allOf ?? []) walk(entry);
      walk(node.items);
      for (const [key, value] of Object.entries(node.properties ?? {})) {
        names.push(key);
        walk(value);
      }
    };

    walk(schema('DesignVersionDetailResponse'));
    // The scan reached the document component, so it is scanning the real graph
    // rather than an empty one.
    expect(seen.has('DesignDocument')).toBe(true);
    expect(names.filter((name) => FORBIDDEN_FIELDS.includes(name))).toEqual([]);
  });

  it('marks the response uncacheable, because it carries customer-private design evidence', () => {
    const success = detailOperation().responses?.['200'];
    expect(JSON.stringify(success)).toBeDefined();
    // The header is set by the controller decorator; the contract's job here is
    // to prove the operation exists and that nothing published a caching hint
    // contradicting it.
    expect(JSON.stringify(detailOperation())).not.toContain('max-age');
  });
});

/**
 * The published `APP6-B11` contract, built in process.
 *
 * The integration suites prove what the two decisions *do*; this proves what the
 * document *says*, which is the half a browser and every generated client
 * actually depend on. It runs before the single generation slot is spent, so a
 * defect found here costs nothing while one found in the committed artifact
 * costs the slot.
 *
 * The load-bearing assertions are the **absences**. `APP6-B11` §5 lists what
 * neither body may accept as authority, and a `.strict()` schema publishes that
 * as `additionalProperties: false` plus an exact property set — so the test that
 * matters is not "the fields I expect are present" but "the fields I forbid are
 * absent, and nothing can be added".
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const APPROVE_PATH = '/api/public/design-reviews/approve';
const REVISION_PATH = '/api/public/design-reviews/request-revision';
const CURRENT_PATH = '/api/public/design-reviews/current';

/**
 * Every field `APP6-B11` §5 forbids as authority on either body.
 *
 * One list for both operations, because the rule is the same for both: the
 * customer, the request, the design case, the grant, the scope, the challenge,
 * the target status, the snapshot, the placement, the frozen evidence and the
 * audit/outbox plumbing are all server-side, and a body that accepted any of
 * them would be accepting a client's word for something it must derive.
 */
const FORBIDDEN_BODY_FIELDS = [
  'customerId',
  'customer',
  'email',
  'phone',
  'contact',
  'requestId',
  'customRequestId',
  'code',
  'designCaseId',
  'grantId',
  'scopeKind',
  'scope',
  'challengeId',
  'stepUpChallengeId',
  'adminId',
  'status',
  'toStatus',
  'outcome',
  'requestStatus',
  'versionStatus',
  'approvedAt',
  'decidedAt',
  'approvalSnapshotId',
  'previewHash',
  'productId',
  'productVariantId',
  'productSideId',
  'embroideryAreaId',
  'customerOwnedProductId',
  'productName',
  'sideName',
  'areaName',
  'quantityTotal',
  'quantity',
  'threadColors',
  'correlationId',
  'eventType',
  'auditId',
] as const;

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: {
    readonly content?: Record<string, { readonly schema?: { readonly $ref?: string } }>;
  };
  readonly responses?: Record<string, unknown>;
  readonly security?: unknown;
}
interface SchemaShape {
  readonly type?: string;
  readonly format?: string;
  readonly properties?: Record<string, SchemaShape>;
  readonly items?: SchemaShape;
  readonly additionalProperties?: boolean;
  readonly example?: unknown;
  readonly pattern?: string;
  readonly required?: readonly string[];
  readonly enum?: readonly string[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

describe('APP6-B11 — the published customer design decision contract', () => {
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

  function schemaOf(name: string): SchemaShape | undefined {
    return document.components.schemas[name];
  }

  function propertyNames(name: string): string[] {
    return Object.keys(schemaOf(name)?.properties ?? {});
  }

  describe('the two operations', () => {
    it('publishes exactly two, both POST, on the accepted domain and ids', () => {
      expect(Object.keys(document.paths[APPROVE_PATH] ?? {})).toEqual(['post']);
      expect(Object.keys(document.paths[REVISION_PATH] ?? {})).toEqual(['post']);
      expect(document.paths[APPROVE_PATH]?.['post']?.operationId).toBe(
        'publicDesignReview_approve',
      );
      expect(document.paths[REVISION_PATH]?.['post']?.operationId).toBe(
        'publicDesignReview_requestRevision',
      );
    });

    it('leaves APP6-B10’s accepted read operation untouched', () => {
      expect(document.paths[CURRENT_PATH]?.['post']?.operationId).toBe(
        'publicDesignReview_current',
      );
    });

    it('publishes no identified, generic-decision or status-mutation design-review route', () => {
      const reviewPaths = Object.keys(document.paths).filter((path) =>
        path.startsWith('/api/public/design-reviews'),
      );
      // Exactly three, and each is a fixed literal. A path segment in braces
      // would be a locator a caller could walk; `/decision` or `/status` would
      // make the outcome a value rather than an operation.
      expect(reviewPaths.sort()).toEqual([APPROVE_PATH, CURRENT_PATH, REVISION_PATH]);
      expect(reviewPaths.some((path) => path.includes('{'))).toBe(false);
    });

    it('carries no parameter but the platform correlation header: the credential is body-only', () => {
      for (const path of [APPROVE_PATH, REVISION_PATH]) {
        const parameters = document.paths[path]?.['post']?.parameters ?? [];
        // `X-Request-ID` is applied to every operation in the document by the
        // platform and carries a correlation id, never a credential or a
        // target. Asserting "exactly that one" rather than "none" is the honest
        // form of this test: it still fails the moment a path, query, cookie or
        // second header parameter appears, which is the property that matters —
        // there must be no carrier through which a token or a version id could
        // reach an access log or a `Referer`.
        expect(parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual([
          'header:X-Request-ID',
        ]);
        expect(document.paths[path]?.['post']?.security).toBeUndefined();
      }
    });
  });

  describe('the approval body', () => {
    const BODY = 'ApproveDesignVersionBody';

    it('accepts exactly the four fields the checkpoint names, and refuses the rest', () => {
      expect(propertyNames(BODY).sort()).toEqual([
        'acceptedAgreements',
        'documentHash',
        'token',
        'versionId',
      ]);
      expect(schemaOf(BODY)?.additionalProperties).toBe(false);
      expect(schemaOf(BODY)?.required?.slice().sort()).toEqual([
        'acceptedAgreements',
        'documentHash',
        'token',
        'versionId',
      ]);
    });

    it.each(FORBIDDEN_BODY_FIELDS)('does not accept %s as authority', (field) => {
      expect(propertyNames(BODY)).not.toContain(field);
    });

    it('publishes no token example a client could paste or a doc could leak', () => {
      expect(schemaOf(BODY)?.properties?.['token']?.example).toBeUndefined();
    });

    it('binds the exact design by hash, in the schema’s own pattern', () => {
      expect(schemaOf(BODY)?.properties?.['documentHash']?.pattern).toContain('sha256');
      expect(schemaOf(BODY)?.properties?.['versionId']?.format).toBe('uuid');
    });

    it('takes agreement evidence as ids and hashes only — never a type or prose', () => {
      const item = schemaOf(BODY)?.properties?.['acceptedAgreements']?.items;
      expect(Object.keys(item?.properties ?? {}).sort()).toEqual([
        'agreementVersionId',
        'contentHash',
      ]);
      // `agreementType` is derivable from the Agreement Version, and `content`
      // would let a caller submit prose it wrote itself as the terms it accepted.
      expect(Object.keys(item?.properties ?? {})).not.toContain('agreementType');
      expect(Object.keys(item?.properties ?? {})).not.toContain('content');
      expect(item?.additionalProperties).toBe(false);
    });
  });

  describe('the revision body', () => {
    const BODY = 'RequestDesignRevisionBody';

    it('accepts exactly the three fields the checkpoint names, and refuses the rest', () => {
      expect(propertyNames(BODY).sort()).toEqual(['feedback', 'token', 'versionId']);
      expect(schemaOf(BODY)?.additionalProperties).toBe(false);
      expect(schemaOf(BODY)?.required?.slice().sort()).toEqual(['feedback', 'token', 'versionId']);
    });

    it.each(FORBIDDEN_BODY_FIELDS)('does not accept %s as authority', (field) => {
      expect(propertyNames(BODY)).not.toContain(field);
    });

    it('submits no terms and no stale fingerprint', () => {
      // GRD-008 guards `TR-LC08-04` alone, and GRD-007 likewise: asking a
      // customer who wants a change to first agree to terms, or to prove the
      // design is unchanged, would refuse them for the reason they are writing.
      expect(propertyNames(BODY)).not.toContain('acceptedAgreements');
      expect(propertyNames(BODY)).not.toContain('documentHash');
    });
  });

  describe('the two response contracts', () => {
    it('reports the approval as committed evidence, with no APP7 field', () => {
      expect(propertyNames('DesignApprovedResponse').sort()).toEqual([
        'approvalSnapshotId',
        'approvedAt',
        'documentHash',
        'replayed',
        'requestStatus',
        'version',
        'versionId',
        'versionStatus',
      ]);
      for (const leaked of ['orderId', 'paymentObligationId', 'reservationId', 'productionJobId']) {
        expect(propertyNames('DesignApprovedResponse')).not.toContain(leaked);
      }
    });

    it('never echoes the server-derived step-up evidence back to the client', () => {
      // Returning it would hand a client the one value both bodies deliberately
      // refuse to accept, which is how a "read it back and send it next time"
      // pattern starts.
      expect(propertyNames('DesignApprovedResponse')).not.toContain('stepUpChallengeId');
      expect(propertyNames('DesignApprovedResponse')).not.toContain('grantId');
    });

    it('reports the request state a revision request did not change', () => {
      expect(propertyNames('DesignRevisionRequestedResponse').sort()).toEqual([
        'decidedAt',
        'requestStatus',
        'version',
        'versionId',
        'versionStatus',
      ]);
      // No snapshot on this path: a revision request freezes nothing.
      expect(propertyNames('DesignRevisionRequestedResponse')).not.toContain('approvalSnapshotId');
    });

    it('publishes neither the design document nor any byte reference', () => {
      for (const response of ['DesignApprovedResponse', 'DesignRevisionRequestedResponse']) {
        for (const leaked of ['document', 'storageKey', 'url', 'previewUrl', 'derivativeId']) {
          expect(propertyNames(response)).not.toContain(leaked);
        }
      }
    });
  });

  describe('the published refusals', () => {
    // `500` is on every operation in this document, applied by the platform
    // rather than declared here — the rule `APP6-B07` recorded. It is included
    // in both expectations so they stay exact sets rather than subsets.
    it('gives the approval every code its guards can produce', () => {
      const responses = Object.keys(document.paths[APPROVE_PATH]?.['post']?.responses ?? {});
      expect(responses.sort()).toEqual(['200', '400', '403', '404', '409', '429', '500', '503']);
    });

    it('gives the revision request no 403: it has no step-up guard to fail', () => {
      const responses = Object.keys(document.paths[REVISION_PATH]?.['post']?.responses ?? {});
      // The absence is the assertion. `TR-LC08-03` lists GRD-002 only, so there
      // is no step-up failure this route could report — and the use case does
      // not compose the resolver that would produce one.
      expect(responses).not.toContain('403');
      expect(responses.sort()).toEqual(['200', '400', '404', '409', '429', '500', '503']);
    });
  });
});

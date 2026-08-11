/**
 * The Session bootstrap and resume contracts (`APP3-B07`).
 *
 * The cases worth reading twice are the DTO-bridge ones. A discriminated-union
 * body cannot be a TypeScript base class, and the obvious workarounds all fail
 * *silently*: annotate the parameter with an inferred type and Nest emits
 * `Object`, the global pipe finds no schema, and the endpoint stops validating
 * while every test still passes. So the metatype and its attached schema are
 * asserted directly, not inferred from the fact that valid input works.
 */
import 'reflect-metadata';

import {
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  validateDesignDocumentStructure,
} from '@embroidery/design-document';

import { DesignDocumentAuthority } from './application/design-document.authority';
import { SESSION_TTL_DAYS } from './application/open-design-session.use-case';
import { DesignSessionSecretIssuer } from './infrastructure/crypto/design-session-secret.issuer';
import { DesignSessionSecretVerifier } from './infrastructure/crypto/design-session-secret.verifier';
import { DesignSessionCookiePolicy } from './infrastructure/http/design-session-cookie.policy';
import { PublicDesignSessionController } from './presentation/public-design-session.controller';
import {
  createDesignSessionSchema,
  CreateDesignSessionBody,
  DesignSessionIdParam,
} from './presentation/schemas/public-design-session.request';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import type { DesignSessionAuthConfig } from './config/design-session-auth.config';
import type { ResolvedDesignScope } from './application/design-session-scope.resolver';

const PEPPER = 'p'.repeat(48);
const config: DesignSessionAuthConfig = {
  secretPepper: PEPPER,
  allowedOrigins: ['https://studio.test'],
  cookieSecure: true,
  rateLimits: {
    mutation: { max: 30, windowMs: 60_000 },
    authorizationFailure: { max: 10, windowMs: 900_000 },
    creation: { max: 5, windowMs: 3_600_000 },
    creationBurst: { max: 2, windowMs: 60_000 },
    read: { max: 60, windowMs: 60_000 },
  },
};

const SCOPE: ResolvedDesignScope = {
  productId: 'product-1',
  productSideId: 'side-1',
  embroideryAreaId: 'area-1',
  maxWidthMm: 60,
  maxHeightMm: 40,
  view: {
    productSlug: 'ao-thun',
    sideCode: 'front',
    areaCode: 'chest',
    canvasWidthPx: 1000,
    canvasHeightPx: 1200,
    physicalWidthMm: 400,
    physicalHeightMm: 480,
    pxPerMm: 2.5,
    boundXPx: 100,
    boundYPx: 150,
    boundWidthPx: 150,
    boundHeightPx: 100,
  },
};

const blank = { mode: 'BLANK', productSlug: 'ao-thun', sideCode: 'front', areaCode: 'chest' };
const clone = { ...blank, mode: 'CLONE_TEMPLATE', templateSlug: 'hoa-sen' };

describe('the bootstrap body contract', () => {
  it('accepts each branch and rejects the other branch’s field', () => {
    expect(createDesignSessionSchema.safeParse(blank).success).toBe(true);
    expect(createDesignSessionSchema.safeParse(clone).success).toBe(true);
    // BLANK carrying a Template identifier is structurally impossible, not a
    // field that is quietly ignored.
    expect(createDesignSessionSchema.safeParse({ ...blank, templateSlug: 'x' }).success).toBe(
      false,
    );
  });

  it('requires the Template identifier on a clone', () => {
    const { templateSlug, ...withoutTemplate } = clone;
    void templateSlug;
    expect(createDesignSessionSchema.safeParse(withoutTemplate).success).toBe(false);
  });

  it('rejects an unknown discriminator and any unknown field', () => {
    expect(createDesignSessionSchema.safeParse({ ...blank, mode: 'OTHER' }).success).toBe(false);
    expect(createDesignSessionSchema.safeParse({ ...blank, extra: 1 }).success).toBe(false);
  });

  it('refuses server-owned fields the caller must never supply', () => {
    for (const field of [
      'sessionId',
      'secret',
      'status',
      'expiresAt',
      'revision',
      'designDocument',
      'documentSchemaVersion',
    ]) {
      expect(createDesignSessionSchema.safeParse({ ...blank, [field]: 'x' }).success).toBe(false);
    }
  });
});

describe('the union DTO bridge', () => {
  it('leaves a concrete class in the parameter metadata, not Object', () => {
    // The failure this guards: an inferred-type annotation makes Nest emit
    // `Object`, the pipe finds no schema, and validation silently stops.
    const paramtypes = Reflect.getMetadata(
      'design:paramtypes',
      PublicDesignSessionController.prototype,
      'create',
    ) as unknown[];
    expect(paramtypes[0]).toBe(CreateDesignSessionBody);
    expect(paramtypes[0]).not.toBe(Object);
  });

  it('carries the exact schema the pipe validates against', () => {
    expect(zodSchemaOf(CreateDesignSessionBody)).toBe(createDesignSessionSchema);
  });

  it('is the same schema the controller narrows with, so the two cannot diverge', () => {
    const narrowed = createDesignSessionSchema.parse(clone);
    expect(narrowed.mode).toBe('CLONE_TEMPLATE');
    if (narrowed.mode === 'CLONE_TEMPLATE') expect(narrowed.templateSlug).toBe('hoa-sen');
  });

  it('keeps the path parameter a schema-backed class too', () => {
    expect(zodSchemaOf(DesignSessionIdParam)).toBeDefined();
  });
});

describe('the blank document', () => {
  const authority = new DesignDocumentAuthority();

  it('is built from the resolved placement and is P01-valid', () => {
    const document = authority.buildEmptyDocument(SCOPE);
    expect(document.schemaVersion).toBe(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION);
    expect(document.elements).toEqual([]);
    expect(document.placement.productSideId).toBe('side-1');
    expect(document.placement.pxPerMm).toBe(2.5);
    // Proved through P01 itself, not through this module's own opinion.
    expect(validateDesignDocumentStructure(document).ok).toBe(true);
  });

  it('is validated rather than trusted for being empty', () => {
    expect(authority.validate(authority.buildEmptyDocument(SCOPE), SCOPE).ok).toBe(true);
  });

  it('refuses a document authored against another Side', () => {
    const foreign = {
      ...authority.buildEmptyDocument(SCOPE),
      placement: { ...authority.buildEmptyDocument(SCOPE).placement, productSideId: 'side-2' },
    };
    const outcome = authority.validate(foreign, SCOPE);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.rejection).toBe('DOCUMENT_PLACEMENT_MISMATCH');
  });

  it('refuses a structurally invalid or wrong-version document', () => {
    expect(authority.validate({ nope: true }, SCOPE).ok).toBe(false);
    const wrongVersion = { ...authority.buildEmptyDocument(SCOPE), schemaVersion: 999 };
    const outcome = authority.validate(wrongVersion, SCOPE);
    if (!outcome.ok) expect(outcome.rejection).toBe('DOCUMENT_SCHEMA_UNSUPPORTED');
  });
});

describe('secret issuance and the cookie', () => {
  const verifier = new DesignSessionSecretVerifier(config);
  const issuer = new DesignSessionSecretIssuer(verifier);
  const cookies = new DesignSessionCookiePolicy(config);

  it('mints a secret the B06A verifier accepts, and persists only its digest', () => {
    const issued = issuer.issue();
    expect(issued.rawSecret).toHaveLength(43);
    expect(verifier.verify(issued.rawSecret, issued.secretHash)).toBe(true);
    // The stored form must not be the secret.
    expect(issued.secretHash).not.toBe(issued.rawSecret);
  });

  it('never repeats a secret', () => {
    const seen = new Set(Array.from({ length: 50 }, () => issuer.issue().rawSecret));
    expect(seen.size).toBe(50);
  });

  it('sets a cookie that cannot outlive the session', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60);
    const value = cookies.serializeSessionCookie(
      '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
      'S'.repeat(43),
      expiresAt,
      now,
    );
    expect(value).toContain('Max-Age=3600');
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Lax');
    expect(value).toContain('Secure');
    expect(value).not.toContain('Domain');
    expect(value.startsWith('__Host-nettheu_ds_')).toBe(true);
  });

  it('clamps an already-expired session to a zero lifetime', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const value = cookies.serializeSessionCookie(
      '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
      'x',
      new Date(0),
      now,
    );
    expect(value).toContain('Max-Age=0');
  });
});

describe('the locked TTL', () => {
  it('is 30 absolute days', () => {
    expect(SESSION_TTL_DAYS).toBe(30);
  });
});

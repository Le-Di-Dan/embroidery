/**
 * Design Session asset delivery — the authorization equation (`APP3-B06C` §5,
 * §7, §9, §12, §14, §16).
 *
 * The route's whole security argument is that independent facts must hold at
 * once, that failing any one of them is indistinguishable from failing any other,
 * and that **no object-storage call happens until all of them have succeeded**.
 * The live suite proves the happy path against a real database and a real
 * provider; this suite exists to break each term on its own and watch the answer
 * stay the same.
 *
 * Three properties dominate, and none is visible from a happy-path test:
 *
 *  - **ordering** — a denied request must produce zero provider calls, so a
 *    caller probing asset ids cannot use provider load or response timing as an
 *    existence oracle;
 *  - **reconciliation** — the object about to be streamed must be the object the
 *    row describes, and where the provider count and the persisted `byte_size`
 *    disagree the honest answer is to send neither;
 *  - **read-only** — a GET that succeeds or fails must leave the Session, the
 *    Asset, the association and the derivative exactly as it found them.
 *
 * The guard half is exercised against the real `AuthorizeDesignSessionService`
 * with a real verifier and cookie policy: "a cookie for Session A cannot read
 * Session B" is the one claim a stubbed authorizer would assert about itself.
 */
import { ObjectStorageError, type ObjectStoragePort } from '@embroidery/object-storage';
import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';

import { DesignSessionAssetDeliveryService } from './application/design-session-asset-delivery.service';
import { AuthorizeDesignSessionService } from './application/authorize-design-session.service';
import { DesignSessionSecretVerifier } from './infrastructure/crypto/design-session-secret.verifier';
import { DesignSessionCookiePolicy } from './infrastructure/http/design-session-cookie.policy';
import { DesignSessionOriginPolicy } from './infrastructure/http/design-session-origin.policy';
import { DesignSessionRateLimiter } from './infrastructure/rate-limit/design-session-rate-limiter';
import { EphemeralNetworkKeyService } from './infrastructure/rate-limit/ephemeral-network-key.service';
import { SlidingWindowRateLimiter } from '../../platform/rate-limit/sliding-window-rate-limiter';
import { DesignSessionReadGuard } from './presentation/guards/design-session-read.guard';
import { readDesignSessionContext } from './presentation/design-session-context';
import type {
  DesignSessionAssetDeliveryRepository,
  SessionAssetCandidate,
  SessionAssetLookup,
} from './domain/repositories/design-session-asset-delivery.repository';
import type {
  DesignSession,
  DesignSessionId,
  DesignSessionRepository,
} from './domain/repositories/design-session.repository';
import { SESSION_ASSET_MEDIA_TYPES } from './domain/design-session-asset-delivery.policy';

const SESSION_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6070';
const OTHER_SESSION_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6075';
const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const BYTES = Buffer.from('SESSION-UPLOAD-'.repeat(8), 'utf8');
const AT = new Date('2026-08-11T09:00:00.000Z');

const LOOKUP: SessionAssetLookup = {
  sessionId: SESSION_ID as DesignSessionId,
  assetId: ASSET_ID,
  at: AT,
};

function candidate(overrides: Partial<SessionAssetCandidate> = {}): SessionAssetCandidate {
  return {
    storageKey: `development/derivatives/${ASSET_ID}/NORMALIZED.webp`,
    mediaType: 'image/webp',
    byteSize: BYTES.length,
    ...overrides,
  };
}

interface Harness {
  readonly service: DesignSessionAssetDeliveryService;
  readonly lookups: SessionAssetLookup[];
  readonly opened: string[];
}

function build(options: {
  candidate?: SessionAssetCandidate | undefined;
  providerSize?: number;
  fail?: 'missing' | 'aborted';
}): Harness {
  const lookups: SessionAssetLookup[] = [];
  const opened: string[] = [];

  const repository: DesignSessionAssetDeliveryRepository = {
    findDeliverableCandidate: (lookup) => {
      lookups.push(lookup);
      return Promise.resolve(options.candidate);
    },
  };

  const storage = {
    getObjectStream: (reference: { bucket: string; key: string }) => {
      opened.push(`${reference.bucket}:${reference.key}`);
      if (options.fail === 'missing') {
        return Promise.reject(new ObjectStorageError('OBJECT_NOT_FOUND', 'gone'));
      }
      if (options.fail === 'aborted') {
        return Promise.reject(new ObjectStorageError('REQUEST_ABORTED', 'gone'));
      }
      return Promise.resolve({
        body: Readable.from([BYTES]),
        sizeBytes: options.providerSize ?? BYTES.length,
        contentType: 'application/octet-stream',
      });
    },
  } as unknown as ObjectStoragePort;

  return {
    service: new DesignSessionAssetDeliveryService(repository, storage),
    lookups,
    opened,
  };
}

async function refusalCode(harness: Harness): Promise<string> {
  try {
    await harness.service.open(LOOKUP, new AbortController().signal);
  } catch (error: unknown) {
    return (error as { code: string }).code;
  }
  throw new Error('The delivery unexpectedly succeeded.');
}

describe('APP3-B06C descriptor-before-storage ordering', () => {
  it('streams the persisted derivative when every term holds', async () => {
    const harness = build({ candidate: candidate() });

    const stream = await harness.service.open(LOOKUP, new AbortController().signal);

    expect(stream.contentType).toBe('image/webp');
    expect(stream.contentLengthBytes).toBe(BYTES.length);
    // The bucket is the private derivatives bucket, and the key is the persisted
    // one — never a value derived from the request.
    expect(harness.opened).toEqual([
      `DERIVATIVES:development/derivatives/${ASSET_ID}/NORMALIZED.webp`,
    ]);
  });

  it('opens no object at all when the descriptor refuses', async () => {
    const harness = build({ candidate: undefined });

    expect(await refusalCode(harness)).toBe('DESIGN_SESSION_ASSET_NOT_FOUND');
    // The whole ordering claim in one assertion: a probe never reaches storage,
    // so provider load and response timing are not an existence oracle.
    expect(harness.opened).toEqual([]);
  });

  it('resolves the descriptor exactly once, from the authorized context', async () => {
    const harness = build({ candidate: candidate() });

    await harness.service.open(LOOKUP, new AbortController().signal);

    expect(harness.lookups).toEqual([LOOKUP]);
    expect(harness.lookups[0]?.sessionId).toBe(SESSION_ID);
  });
});

describe('APP3-B06C safe private misses are indistinguishable', () => {
  /**
   * Every one of these is a *different* internal condition that the one SQL
   * statement expresses as "no row": an unknown asset, one owned by another
   * Session, a missing association, the wrong lane, `INSPECTING`, `REJECTED`, a
   * tombstone, an absent or unready or watermarked derivative, and an incomplete
   * quartet. The repository cannot report which, because it returns `undefined`
   * for all of them — so the taxonomy is proved by the shape of the contract
   * rather than by re-listing conditions a fake would have to invent.
   */
  it('answers one code for every descriptor miss, with no storage call', async () => {
    const harness = build({ candidate: undefined });

    expect(await refusalCode(harness)).toBe('DESIGN_SESSION_ASSET_NOT_FOUND');
    expect(harness.opened).toHaveLength(0);
  });

  it('refuses a media type outside the normalized output policy', () => {
    // Defence in depth: the SQL already excludes it, and the descriptor narrowing
    // refuses it again. The delivery allowlist is narrower than the *intake*
    // allowlist — JPEG and PNG are accepted uploads whose normalized output is
    // WebP — so a JPEG arriving here would mean the pipeline changed under us.
    expect(SESSION_ASSET_MEDIA_TYPES).toEqual(['image/webp']);
    expect(SESSION_ASSET_MEDIA_TYPES).not.toContain('image/svg+xml');
    expect(SESSION_ASSET_MEDIA_TYPES).not.toContain('image/jpeg');
  });
});

describe('APP3-B06C provider contradiction is 503, never 404', () => {
  it('reports an authorized-but-absent object as unavailable', async () => {
    const harness = build({ candidate: candidate(), fail: 'missing' });

    // Not a 404: the association exists and the row says READY, so telling a
    // customer their own upload is gone would be a lie about durable state.
    expect(await refusalCode(harness)).toBe('DESIGN_SESSION_ASSET_UNAVAILABLE');
  });

  it('refuses a provider size that contradicts the persisted byte size', async () => {
    const harness = build({ candidate: candidate(), providerSize: BYTES.length + 1 });

    expect(await refusalCode(harness)).toBe('DESIGN_SESSION_ASSET_UNAVAILABLE');
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['not finite', Number.NaN],
  ])('refuses a provider size that is %s', async (_label, providerSize) => {
    const harness = build({ candidate: candidate(), providerSize });

    expect(await refusalCode(harness)).toBe('DESIGN_SESSION_ASSET_UNAVAILABLE');
  });

  it('destroys the upstream stream before refusing a contradicted object', async () => {
    const body = Readable.from([BYTES]);
    const storage = {
      getObjectStream: () =>
        Promise.resolve({ body, sizeBytes: BYTES.length + 99, contentType: 'x' }),
    } as unknown as ObjectStoragePort;
    const repository: DesignSessionAssetDeliveryRepository = {
      findDeliverableCandidate: () => Promise.resolve(candidate()),
    };
    const service = new DesignSessionAssetDeliveryService(repository, storage);

    await expect(service.open(LOOKUP, new AbortController().signal)).rejects.toThrow();
    // Otherwise a contradicted object leaves a provider connection draining into
    // a request nobody will ever read.
    expect(body.destroyed).toBe(true);
  });

  it('propagates a client abort as an abort rather than a server fault', async () => {
    const harness = build({ candidate: candidate(), fail: 'aborted' });

    // There is nobody left to answer, so this must not be dressed up as a 503 the
    // logs would read as a storage incident.
    await expect(harness.service.open(LOOKUP, new AbortController().signal)).rejects.toBeInstanceOf(
      ObjectStorageError,
    );
  });
});

/**
 * The Session half, against the real authorization service.
 *
 * The verifier, the cookie policy and the liveness rules are all the accepted
 * `APP3-B06A` ones. Only the repository is a fake, and only because a session row
 * is the thing under test rather than the thing being trusted.
 */
describe('APP3-B06C session credential', () => {
  const PEPPER = 'x'.repeat(48);

  function session(overrides: Partial<DesignSession> = {}): DesignSession {
    return {
      id: SESSION_ID as DesignSessionId,
      sessionSecretHash: '',
      designDocument: {},
      documentSchemaVersion: 1,
      autosaveRevision: 4,
      status: 'ACTIVE',
      expiresAt: new Date(AT.getTime() + 86_400_000),
      lastActivityAt: AT,
      ...overrides,
    } as DesignSession;
  }

  interface GuardHarness {
    readonly guard: DesignSessionReadGuard;
    readonly limiter: DesignSessionRateLimiter;
    readonly mutationChecks: string[];
    readonly headers: Record<string, string>;
  }

  function buildGuard(rows: Record<string, DesignSession>): GuardHarness {
    const config = {
      secretPepper: PEPPER,
      allowedOrigins: ['https://studio.test'],
      cookieSecure: true,
      rateLimits: {
        mutation: { max: 30, windowMs: 60_000 },
        authorizationFailure: { max: 10, windowMs: 900_000 },
        creation: { max: 5, windowMs: 3_600_000 },
        creationBurst: { max: 2, windowMs: 60_000 },
      },
    };
    const verifier = new DesignSessionSecretVerifier(config);
    const sessions = {
      findById: (id: DesignSessionId) => Promise.resolve(rows[id]),
    } as unknown as DesignSessionRepository;
    const authorization = new AuthorizeDesignSessionService(
      sessions,
      verifier,
      new DesignSessionCookiePolicy(config),
    );
    const limiter = new DesignSessionRateLimiter(new SlidingWindowRateLimiter(), config);
    const mutationChecks: string[] = [];
    const spied = new Proxy(limiter, {
      get(target, property, receiver) {
        if (property === 'checkMutation') {
          return (id: string) => {
            mutationChecks.push(id);
            return target.checkMutation(id);
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const headers: Record<string, string> = {};

    return {
      guard: new DesignSessionReadGuard(
        new DesignSessionOriginPolicy(config),
        spied,
        new EphemeralNetworkKeyService(),
        authorization,
      ),
      limiter,
      mutationChecks,
      headers,
    };
  }

  function contextFor(
    harness: GuardHarness,
    request: Record<string, unknown>,
  ): { context: ExecutionContext; request: Record<string, unknown> } {
    const response = {
      setHeader: (name: string, value: string) => {
        harness.headers[name] = value;
      },
    };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
      } as unknown as ExecutionContext,
    };
  }

  const secret = randomBytes(32).toString('base64url');

  function digestOf(value: string): string {
    return new DesignSessionSecretVerifier({
      secretPepper: PEPPER,
      allowedOrigins: [],
      cookieSecure: true,
      rateLimits: {
        mutation: { max: 1, windowMs: 1 },
        authorizationFailure: { max: 1, windowMs: 1 },
        creation: { max: 1, windowMs: 1 },
        creationBurst: { max: 1, windowMs: 1 },
      },
    }).digest(value);
  }

  function cookieHeader(sessionId: string, value: string): string {
    return `__Host-nettheu_ds_${sessionId}=${value}`;
  }

  it('authorizes the matching id and secret pair', async () => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
    });
    const { context, request } = contextFor(harness, {
      headers: { cookie: cookieHeader(SESSION_ID, secret) },
      params: { sessionId: SESSION_ID },
    });

    await expect(harness.guard.canActivate(context)).resolves.toBe(true);
    expect(readDesignSessionContext(request)?.designSessionId).toBe(SESSION_ID);
  });

  it('refuses the session id alone', async () => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
    });
    const { context } = contextFor(harness, {
      headers: {},
      params: { sessionId: SESSION_ID },
    });

    await expect(harness.guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('refuses a foreign session credential against the target session', async () => {
    const otherSecret = randomBytes(32).toString('base64url');
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
      [OTHER_SESSION_ID]: session({
        id: OTHER_SESSION_ID as DesignSessionId,
        sessionSecretHash: digestOf(otherSecret),
      }),
    });
    // The cookie is a *valid* credential — for the other session. The id selects
    // the cookie, so presenting it against this path finds nothing.
    const { context } = contextFor(harness, {
      headers: { cookie: cookieHeader(OTHER_SESSION_ID, otherSecret) },
      params: { sessionId: SESSION_ID },
    });

    await expect(harness.guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it.each([
    ['an expired session', { expiresAt: new Date(Date.now() - 1000) }],
    ['a non-ACTIVE session', { status: 'SUBMITTED' as DesignSession['status'] }],
  ])('refuses %s', async (_label, overrides) => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret), ...overrides }),
    });
    const { context } = contextFor(harness, {
      headers: { cookie: cookieHeader(SESSION_ID, secret) },
      params: { sessionId: SESSION_ID },
    });

    await expect(harness.guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('does not consume the mutation limit', async () => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
    });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const { context } = contextFor(harness, {
        headers: { cookie: cookieHeader(SESSION_ID, secret) },
        params: { sessionId: SESSION_ID },
      });
      await expect(harness.guard.canActivate(context)).resolves.toBe(true);
    }
    // Forty reads is well past PO-07's 30/minute. A Studio scene can reference
    // several images, so charging previews against the *save* budget would let
    // ordinary rendering exhaust a customer's ability to keep their own work.
    expect(harness.mutationChecks).toEqual([]);
  });

  it('issues, rotates and extends nothing on a successful read', async () => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
    });
    const { context } = contextFor(harness, {
      headers: { cookie: cookieHeader(SESSION_ID, secret) },
      params: { sessionId: SESSION_ID },
    });

    await harness.guard.canActivate(context);

    expect(harness.headers).toEqual({});
  });

  it('never places the raw secret or its digest in the request context', async () => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
    });
    const { context, request } = contextFor(harness, {
      headers: { cookie: cookieHeader(SESSION_ID, secret) },
      params: { sessionId: SESSION_ID },
    });

    await harness.guard.canActivate(context);

    const serialized = JSON.stringify(readDesignSessionContext(request));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(digestOf(secret));
  });

  it('refuses an explicit cross-site request before reading a cookie', async () => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
    });
    const { context } = contextFor(harness, {
      headers: { cookie: cookieHeader(SESSION_ID, secret), 'sec-fetch-site': 'cross-site' },
      params: { sessionId: SESSION_ID },
    });

    await expect(harness.guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
  });

  it.each([
    ['no Fetch Metadata at all — a plain-HTTP or non-browser caller', {}],
    ['a same-origin image load, which sends no Origin', { 'sec-fetch-site': 'same-origin' }],
    ['a same-site subresource', { 'sec-fetch-site': 'same-site' }],
  ])('allows %s', async (_label, extra) => {
    const harness = buildGuard({
      [SESSION_ID]: session({ sessionSecretHash: digestOf(secret) }),
    });
    const { context } = contextFor(harness, {
      headers: { cookie: cookieHeader(SESSION_ID, secret), ...extra },
      params: { sessionId: SESSION_ID },
    });

    // Requiring an `Origin` here — as the mutation guard rightly does — would
    // mean no `<img>` could ever display a customer's own upload.
    await expect(harness.guard.canActivate(context)).resolves.toBe(true);
  });
});

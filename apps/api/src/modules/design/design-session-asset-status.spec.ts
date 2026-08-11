/**
 * The `APP3-S06` API additions, without a database.
 *
 * Two subjects, both decided in code rather than in SQL:
 *
 * 1. **The status projection.** What each repository answer becomes, and — more
 *    importantly — what it never becomes. A `READY` that is missing any part of
 *    the `APP3-DB01` quartet is `PROCESSING`, because a Studio told `READY` will
 *    build an `APP3-P01` image element from those numbers.
 * 2. **The read limit** (`APP3-S06` §13), closing
 *    `FU-APP3-B06C-READ-RATE-LIMIT-01`. Proved with an **injected clock**: a test
 *    that crossed a one-minute window by waiting would take a minute and would
 *    still not prove the window moved rather than the machine being slow.
 */
import { randomBytes } from 'node:crypto';
import { HttpStatus, type ExecutionContext } from '@nestjs/common';

import { AuthorizeDesignSessionService } from './application/authorize-design-session.service';
import { DesignSessionAssetStatusService } from './application/design-session-asset-status.service';
import {
  isDesignSessionAssetError,
  toHttpException,
  type DesignSessionAssetError,
} from './domain/design-session-asset-delivery.errors';
import { DesignSessionSecretVerifier } from './infrastructure/crypto/design-session-secret.verifier';
import { DesignSessionCookiePolicy } from './infrastructure/http/design-session-cookie.policy';
import { DesignSessionOriginPolicy } from './infrastructure/http/design-session-origin.policy';
import { DesignSessionRateLimiter } from './infrastructure/rate-limit/design-session-rate-limiter';
import { EphemeralNetworkKeyService } from './infrastructure/rate-limit/ephemeral-network-key.service';
import { SlidingWindowRateLimiter } from '../../platform/rate-limit/sliding-window-rate-limiter';
import { DesignSessionReadGuard } from './presentation/guards/design-session-read.guard';
import type {
  DesignSessionAssetDeliveryRepository,
  SessionAssetLookup,
  SessionAssetStatus,
} from './domain/repositories/design-session-asset-delivery.repository';
import type {
  DesignSession,
  DesignSessionId,
  DesignSessionRepository,
} from './domain/repositories/design-session.repository';

const SESSION_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6070';
const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const DERIVATIVE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';
const PEPPER = 'a'.repeat(48);
const AT = new Date('2026-08-12T10:00:00.000Z');

const LOOKUP: SessionAssetLookup = {
  sessionId: SESSION_ID as DesignSessionId,
  assetId: ASSET_ID,
  at: AT,
};

const READY: SessionAssetStatus = {
  state: 'READY',
  derivativeId: DERIVATIVE_ID,
  widthPx: 1_200,
  heightPx: 800,
  mediaType: 'image/webp',
  byteSize: 51_200,
};

function limits(read = { max: 60, windowMs: 60_000 }) {
  return {
    mutation: { max: 30, windowMs: 60_000 },
    authorizationFailure: { max: 10, windowMs: 900_000 },
    creation: { max: 5, windowMs: 3_600_000 },
    creationBurst: { max: 2, windowMs: 60_000 },
    read,
  };
}

function statusService(answer: SessionAssetStatus | undefined): DesignSessionAssetStatusService {
  const repository: DesignSessionAssetDeliveryRepository = {
    findDeliverableCandidate: () => Promise.resolve(undefined),
    findAssetStatus: () => Promise.resolve(answer),
  };
  return new DesignSessionAssetStatusService(repository);
}

describe('DesignSessionAssetStatusService', () => {
  it('publishes the ready projection with the asset it answers for', async () => {
    await expect(statusService(READY).read(LOOKUP)).resolves.toEqual({
      assetId: ASSET_ID,
      ...READY,
    });
  });

  it.each([['PROCESSING'], ['REJECTED']] as const)('publishes a bare %s state', async (state) => {
    await expect(statusService({ state }).read(LOOKUP)).resolves.toEqual({
      assetId: ASSET_ID,
      state,
    });
  });

  it('carries no media identity on a non-ready state', async () => {
    const view = await statusService({ state: 'PROCESSING' }).read(LOOKUP);

    // A Studio must not be able to build an image element from a state that has
    // no measured derivative behind it.
    expect(Object.keys(view).sort()).toEqual(['assetId', 'state']);
  });

  it('discloses no storage identity in any state', async () => {
    const serialized = JSON.stringify(await statusService(READY).read(LOOKUP));

    for (const forbidden of ['storageKey', 'bucket', 'checksum', 'url', 'filename', 'derivatives/'])
      expect(serialized).not.toContain(forbidden);
  });

  it('refuses an asset this session has no claim on, without saying why', async () => {
    // The same domain refusal `APP3-B06C` raises, and it carries no reason: an
    // unknown asset, another session's asset and one this session never uploaded
    // reach the caller identically.
    const failure = await statusService(undefined)
      .read(LOOKUP)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(isDesignSessionAssetError(failure)).toBe(true);
    expect((failure as DesignSessionAssetError).code).toBe('DESIGN_SESSION_ASSET_NOT_FOUND');
    expect(toHttpException(failure as DesignSessionAssetError).getStatus()).toBe(
      HttpStatus.NOT_FOUND,
    );
    expect((failure as Error).message).not.toContain(ASSET_ID);
    expect((failure as Error).message).not.toContain(SESSION_ID);
  });
});

/**
 * The read limit, on a virtual clock.
 *
 * `SlidingWindowRateLimiter` takes its clock by injection precisely so a window
 * can be crossed deterministically. Nothing here sleeps.
 */
describe('DesignSessionReadGuard — read limit', () => {
  const secret = randomBytes(32).toString('base64url');
  let now = AT.getTime();

  function config(read?: { max: number; windowMs: number }) {
    return {
      secretPepper: PEPPER,
      allowedOrigins: ['https://studio.test'],
      cookieSecure: true,
      rateLimits: limits(read),
    };
  }

  function buildGuard(read?: { max: number; windowMs: number }) {
    const settings = config(read);
    const verifier = new DesignSessionSecretVerifier(settings);
    const row = {
      id: SESSION_ID,
      sessionSecretHash: verifier.digest(secret),
      status: 'ACTIVE',
      expiresAt: new Date(now + 86_400_000),
      autosaveRevision: 1,
      lastActivityAt: AT,
    } as unknown as DesignSession;
    const sessions = {
      findById: (id: DesignSessionId) => Promise.resolve(id === SESSION_ID ? row : undefined),
    } as unknown as DesignSessionRepository;

    const limiter = new DesignSessionRateLimiter(new SlidingWindowRateLimiter(() => now), settings);
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

    const guard = new DesignSessionReadGuard(
      new DesignSessionOriginPolicy(settings),
      spied,
      new EphemeralNetworkKeyService(),
      new AuthorizeDesignSessionService(
        sessions,
        verifier,
        new DesignSessionCookiePolicy(settings),
      ),
    );
    return { guard, limiter, mutationChecks };
  }

  function contextFor(address: string, sessionId = SESSION_ID, credential = secret) {
    const request = {
      headers: { cookie: `__Host-nettheu_ds_${sessionId}=${credential}` },
      params: { sessionId },
      socket: { remoteAddress: address },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader: () => undefined }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    now = AT.getTime();
  });

  it('admits 60 reads in one window and refuses the 61st', async () => {
    const { guard } = buildGuard();
    const context = contextFor('203.0.113.7');

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('admits again once the window has moved', async () => {
    const { guard } = buildGuard();
    const context = contextFor('203.0.113.8');

    for (let attempt = 1; attempt <= 60; attempt += 1) await guard.canActivate(context);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    // The whole window, plus one millisecond. No sleeping, and no restart: the
    // counter is not cleared, it ages out.
    now += 60_001;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('gives a different ephemeral network key its own window', async () => {
    const { guard } = buildGuard();
    const exhausted = contextFor('203.0.113.9');

    for (let attempt = 1; attempt <= 60; attempt += 1) await guard.canActivate(exhausted);
    await expect(guard.canActivate(exhausted)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    await expect(guard.canActivate(contextFor('198.51.100.4'))).resolves.toBe(true);
  });

  it('never touches the mutation counter', async () => {
    const { guard, limiter, mutationChecks } = buildGuard();
    const context = contextFor('203.0.113.10');

    for (let attempt = 1; attempt <= 40; attempt += 1) await guard.canActivate(context);

    expect(mutationChecks).toEqual([]);
    // The full PO-07 mutation budget is still there for the customer's own
    // saves: previewing a scene must never cost them the ability to save it.
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      expect(limiter.checkMutation(SESSION_ID).allowed).toBe(true);
    }
  });

  it('charges an unauthorized probe too', async () => {
    // The limit exists to bound *probing*, so it is spent before the credential
    // is examined. A budget charged only on hits would not bound probing at all.
    const { guard } = buildGuard({ max: 3, windowMs: 60_000 });
    const context = contextFor('203.0.113.11', SESSION_ID, 'not-the-secret');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});

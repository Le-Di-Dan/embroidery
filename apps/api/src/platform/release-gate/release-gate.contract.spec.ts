/**
 * The Wave-2 API gate, proved against the **real** route table (`APP12-G02`).
 *
 * This suite is the auditable form §14 and §21 ask for. It does not assert one
 * representative operation per family, because that is exactly the assertion a
 * 32nd withheld operation slips past. It enumerates every operation the running
 * application actually publishes, computes each one's canonical operation id
 * with the same function that mints the ids in the OpenAPI document, and asks
 * the real guard — the object registered as `APP_GUARD` — what it would do.
 *
 * Two failure modes are therefore both detectable, which is the point:
 *
 * - an operation listed `DENY` in `APP12-RELEASE-WAVE-AUTHORITY.md` that the
 *   guard does not actually refuse;
 * - an operation listed `ALLOW` that the guard refuses — a false denial, which
 *   §11 makes a `G02` blocker because denying `publicVerification_*` denies
 *   Ready-Made checkout and therefore denies Wave 1.
 *
 * The application is created but never initialised or listened on, exactly as
 * `build-openapi-document.spec.ts` does it, so no PostgreSQL, MinIO or network
 * is required.
 */
import { type ExecutionContext, type INestApplication, NotFoundException } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../bootstrap/app.module';
import { ensureGenerationEnvironment } from '../../openapi/generation-environment';
import { createOperationId } from '../../openapi/operation-id';
import { type LogRecordFields } from '../logging/log-record.factory';
import { LOG_EVENT_PATTERN } from '../logging/log-record';
import type { StructuredLogger } from '../logging/structured-logger.service';
import { CustomCapabilityReleaseGuard } from './custom-capability-release.guard';
import {
  SCOPE_GATED_PUBLIC_OPERATIONS,
  SECURE_LINK_SCOPE_RULE,
  WAVE1_RELEASED_PUBLIC_OPERATIONS,
  WAVE2_WITHHELD_PUBLIC_OPERATIONS,
} from './wave2-operation-authority';

/**
 * The counts `APP12-G01` fixed, as `APP12-C01` and `APP12-B02` extended them.
 * Written as literals so a drift is a failure.
 *
 * `APP12-C01` added exactly one public operation — `publicCategory_list`, the
 * dynamic category inventory — and classified it `ALLOW`: 43 -> 44 public,
 * 12 -> 13 allowed. `APP12-B02` added exactly one more —
 * `publicReadyMadeOrder_create`, the Ready-Made order command — and classified
 * it `ALLOW` because Ready-Made direct commerce **is** Wave 1: 44 -> 45 public,
 * 13 -> 14 allowed. The withheld set was untouched by both: 31 denied.
 *
 * `APP12-B04` is the first checkpoint to change the *shape* of the matrix. It
 * published four Ready-Made operations, all `ALLOW` (45 -> 49 public,
 * 14 -> 18 allowed), and moved three secure-token operations out of the static
 * `DENY` set into a third class (31 -> 28 denied, 0 -> 3 scope-gated). Nothing
 * became reachable that was not: a scope-gated operation still refuses every
 * `REQUEST_ACCESS` grant while Wave 2 is unreleased, one layer in, where the
 * resolved grant row can be seen. The three sets stay disjoint and their union
 * is still every public operation the application publishes.
 */
const AUTHORITY_PUBLIC_OPERATIONS = 49;
const AUTHORITY_DENY = 28;
const AUTHORITY_ALLOW = 18;
const AUTHORITY_SCOPE_GATED = 3;

/** Nest's own metadata key for a handler's route path. */
const PATH_METADATA = 'path';

/** The one route publishing an operation id. A miss is a spec failure, not a skip. */
function requireHandler(all: readonly RouteHandler[], operationId: string): RouteHandler {
  const handler = all.find((candidate) => candidate.operationId === operationId);
  if (handler === undefined) {
    throw new Error(`No route publishes ${operationId}.`);
  }
  return handler;
}

interface RouteHandler {
  readonly controllerName: string;
  readonly methodName: string;
  readonly operationId: string;
}

/**
 * Every HTTP handler the application registers, as `(controller, method)` pairs.
 *
 * Discovered from the composed container rather than read from the committed
 * OpenAPI artifact, deliberately: the artifact is what the contract *says*, and
 * this suite has to test what the process *does*. A handler that exists but was
 * never documented would be invisible to an artifact-driven test and perfectly
 * visible here.
 */
function discoverRouteHandlers(app: INestApplication): RouteHandler[] {
  const discovery = app.get(DiscoveryService);
  const scanner = new MetadataScanner();
  const handlers: RouteHandler[] = [];

  for (const wrapper of discovery.getControllers()) {
    // Read through a narrow shape rather than destructured: `InstanceWrapper`
    // types `instance` as `any`, and a raw destructure spreads that `any` into
    // everything downstream.
    const instance: unknown = wrapper.instance;
    const metatype = wrapper.metatype as { name: string } | undefined;
    if (instance === undefined || instance === null || metatype === undefined) {
      continue;
    }
    const prototype = Object.getPrototypeOf(instance) as object;
    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const method = (instance as Record<string, unknown>)[methodName];
      if (typeof method !== 'function') {
        continue;
      }
      if (Reflect.getMetadata(PATH_METADATA, method) === undefined) {
        continue;
      }
      handlers.push({
        controllerName: metatype.name,
        methodName,
        operationId: createOperationId(metatype.name, methodName),
      });
    }
  }
  return handlers;
}

/** A minimal HTTP `ExecutionContext` carrying only what the guard reads. */
function contextFor(handler: RouteHandler): ExecutionContext {
  return {
    getType: () => 'http',
    getClass: () => ({ name: handler.controllerName }),
    getHandler: () => ({ name: handler.methodName }),
  } as unknown as ExecutionContext;
}

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
} as unknown as StructuredLogger;

describe('Wave-2 API release gate', () => {
  let app: INestApplication;
  let handlers: RouteHandler[];
  let publicOperationIds: string[];
  let previousDatabaseUrl: string | undefined;

  beforeAll(async () => {
    previousDatabaseUrl = process.env['DATABASE_URL'];
    ensureGenerationEnvironment();
    // The real `AppModule`, plus `DiscoveryModule` so the composed container can
    // be enumerated. Created but never initialised or listened on, so no
    // PostgreSQL, MinIO or network is required.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    handlers = discoverRouteHandlers(app);
    publicOperationIds = handlers
      .map((handler) => handler.operationId)
      .filter((id) => id.startsWith('public'))
      .sort();
  });

  afterAll(async () => {
    await app?.close();
    if (previousDatabaseUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousDatabaseUrl;
    }
  });

  describe('the authority matrix', () => {
    it('withholds exactly the 28 operations the authority classifies DENY', () => {
      expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.size).toBe(AUTHORITY_DENY);
    });

    it('releases exactly the 18 operations the authority classifies ALLOW', () => {
      expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.size).toBe(AUTHORITY_ALLOW);
    });

    it('scope-gates exactly the 3 operations that resolve a grant', () => {
      expect(SCOPE_GATED_PUBLIC_OPERATIONS.size).toBe(AUTHORITY_SCOPE_GATED);
    });

    it('classifies no operation two ways', () => {
      const all = [
        ...WAVE2_WITHHELD_PUBLIC_OPERATIONS,
        ...WAVE1_RELEASED_PUBLIC_OPERATIONS,
        ...SCOPE_GATED_PUBLIC_OPERATIONS,
      ];
      expect(all).toHaveLength(new Set(all).size);
    });

    /**
     * The assertion that makes the matrix maintainable rather than merely
     * correct today. A later checkpoint that publishes a public operation and
     * does not classify it fails here, before the operation can quietly become
     * a hole in the gate or a false denial.
     */
    it('classifies every public operation the application publishes, and nothing else', () => {
      const classified = [
        ...WAVE2_WITHHELD_PUBLIC_OPERATIONS,
        ...WAVE1_RELEASED_PUBLIC_OPERATIONS,
        ...SCOPE_GATED_PUBLIC_OPERATIONS,
      ].sort();
      expect(publicOperationIds).toHaveLength(AUTHORITY_PUBLIC_OPERATIONS);
      expect(classified).toEqual(publicOperationIds);
    });
  });

  describe('with the capability withheld', () => {
    let guard: CustomCapabilityReleaseGuard;

    beforeAll(() => {
      guard = new CustomCapabilityReleaseGuard({ enabled: false, malformed: false }, silentLogger);
    });

    it('refuses every one of the 28 withheld operations', () => {
      const admitted = handlers
        .filter((handler) => WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(handler.operationId))
        .filter((handler) => {
          try {
            guard.canActivate(contextFor(handler));
            return true;
          } catch {
            return false;
          }
        })
        .map((handler) => handler.operationId);

      expect(admitted).toEqual([]);
    });

    it('refuses with a bare 404 that names nothing about the release state', () => {
      const withheld = handlers.find((handler) =>
        WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(handler.operationId),
      );
      expect(withheld).toBeDefined();

      let thrown: unknown;
      try {
        guard.canActivate(contextFor(withheld as RouteHandler));
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(NotFoundException);
      const body = JSON.stringify((thrown as NotFoundException).getResponse());
      // §13: no flag name, no wave, no operation id, no configured value.
      expect(body).not.toContain('CUSTOM_EMBROIDERY');
      expect(body).not.toContain('Wave');
      expect(body).not.toContain('release');
      expect(body).not.toContain(withheld?.operationId ?? '');
    });

    it('admits every one of the 14 released public operations', () => {
      const denied = handlers
        .filter((handler) => WAVE1_RELEASED_PUBLIC_OPERATIONS.has(handler.operationId))
        .filter((handler) => {
          try {
            guard.canActivate(contextFor(handler));
            return false;
          } catch {
            return true;
          }
        })
        .map((handler) => handler.operationId);

      expect(denied).toEqual([]);
    });

    /**
     * `APP12-B02` §42, asserted by name rather than only as a member of the
     * set above. Ready-Made direct commerce **is** Wave 1, so the operation that
     * creates the order has to work while custom embroidery is withheld — and a
     * regression that reclassified it would otherwise only show up as a count.
     */
    it('admits the Ready-Made order command while custom embroidery is withheld', () => {
      const handler = handlers.find(
        (candidate) => candidate.operationId === 'publicReadyMadeOrder_create',
      );
      expect(handler).toBeDefined();
      expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.has('publicReadyMadeOrder_create')).toBe(true);
      expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.has('publicReadyMadeOrder_create')).toBe(false);
      expect(guard.canActivate(contextFor(handler as RouteHandler))).toBe(true);
    });

    /**
     * §5: Admin is behind staff authentication and is not blanket-blocked, and
     * §17: health must stay healthy in both release states. Neither is
     * customer-facing release surface, so neither may be touched by this gate.
     */
    it('admits every admin, staff and health operation', () => {
      const denied = handlers
        .filter((handler) => !handler.operationId.startsWith('public'))
        .filter((handler) => {
          try {
            guard.canActivate(contextFor(handler));
            return false;
          } catch {
            return true;
          }
        })
        .map((handler) => handler.operationId);

      expect(denied).toEqual([]);
    });

    /**
     * §13 permits the denial reason in the structured log and nowhere else, so
     * that record is the only operational evidence a gate decision leaves. It is
     * worthless if the platform silently rewrites the event name: `buildLogRecord`
     * replaces any event failing `LOG_EVENT_PATTERN` with `platform.log`, which
     * would make every release denial indistinguishable from every other log line.
     */
    it('records the denial under a queryable canonical event name', () => {
      const emitted: { event: string; fields?: LogRecordFields }[] = [];
      const capturing = {
        info: (event: string, _message: string, fields?: LogRecordFields) => {
          emitted.push({ event, ...(fields === undefined ? {} : { fields }) });
        },
        warn: () => undefined,
      } as unknown as StructuredLogger;
      const withheld = handlers.find((handler) =>
        WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(handler.operationId),
      ) as RouteHandler;

      expect(() =>
        new CustomCapabilityReleaseGuard(
          { enabled: false, malformed: false },
          capturing,
        ).canActivate(contextFor(withheld)),
      ).toThrow(NotFoundException);

      expect(emitted).toHaveLength(1);
      expect(emitted[0]?.event).toMatch(LOG_EVENT_PATTERN);
      expect(emitted[0]?.fields?.attributes).toEqual({ operationId: withheld.operationId });
    });

    /**
     * §3.2 — the obligation `APP12-G02` recorded, discharged by `APP12-B04`.
     *
     * The guard must **admit** the resolver: the wave a secure link belongs to
     * is a property of the grant row, which no route-level guard can see, so a
     * whole-operation denial here would take `/truy-cap/don-hang` with it.
     * `GrantScopeReleaseGate` refuses the withheld scope instead, one layer in.
     */
    it('admits publicSecureLink_resolve and gates it by scope instead', () => {
      expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(SECURE_LINK_SCOPE_RULE.operationId)).toBe(false);
      expect(SCOPE_GATED_PUBLIC_OPERATIONS.has(SECURE_LINK_SCOPE_RULE.operationId)).toBe(true);
      expect(SECURE_LINK_SCOPE_RULE.deliveredBy).toBe('APP12-B04');
      expect(SECURE_LINK_SCOPE_RULE.rule).toBe('GATE_BY_SCOPE_KIND');
      expect(SECURE_LINK_SCOPE_RULE.allowedInWave1).toBe('ORDER_ACCESS');
      expect(SECURE_LINK_SCOPE_RULE.withheldUntilWave2).toBe('REQUEST_ACCESS');

      const resolver = requireHandler(handlers, SECURE_LINK_SCOPE_RULE.operationId);
      expect(guard.canActivate(contextFor(resolver))).toBe(true);
    });

    /** §22 — the reused attempt-scoped evidence lane, for the same reason. */
    it('admits the evidence lane and gates it by scope', () => {
      for (const operationId of [
        'publicOrderDepositEvidence_upload',
        'publicOrderDepositEvidence_status',
      ]) {
        expect(SCOPE_GATED_PUBLIC_OPERATIONS.has(operationId)).toBe(true);
        expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(operationId)).toBe(false);
        expect(guard.canActivate(contextFor(requireHandler(handlers, operationId)))).toBe(true);
      }
    });

    /** §41, §47 — the four Ready-Made operations must run with Wave 2 off. */
    it('admits every APP12-B04 Ready-Made operation', () => {
      for (const operationId of [
        'publicReadyMadeOrder_current',
        'publicOrderFullPayment_current',
        'publicOrderFullPayment_qr',
        'publicOrderFullPayment_initiate',
      ]) {
        expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.has(operationId)).toBe(true);
        expect(guard.canActivate(contextFor(requireHandler(handlers, operationId)))).toBe(true);
      }
    });
  });

  describe('with the capability released', () => {
    it('admits every operation the application publishes, withheld or not', () => {
      const guard = new CustomCapabilityReleaseGuard(
        { enabled: true, malformed: false },
        silentLogger,
      );
      const denied = handlers
        .filter((handler) => {
          try {
            guard.canActivate(contextFor(handler));
            return false;
          } catch {
            return true;
          }
        })
        .map((handler) => handler.operationId);

      expect(denied).toEqual([]);
    });
  });
});

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
  SECURE_LINK_REOPEN_OBLIGATION,
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
 * 13 -> 14 allowed. The withheld set is untouched by both: 31 denied throughout.
 */
const AUTHORITY_PUBLIC_OPERATIONS = 45;
const AUTHORITY_DENY = 31;
const AUTHORITY_ALLOW = 14;

/** Nest's own metadata key for a handler's route path. */
const PATH_METADATA = 'path';

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
    it('withholds exactly the 31 operations APP12-G01 classified DENY', () => {
      expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.size).toBe(AUTHORITY_DENY);
    });

    it('releases exactly the 14 operations the authority classifies ALLOW', () => {
      expect(WAVE1_RELEASED_PUBLIC_OPERATIONS.size).toBe(AUTHORITY_ALLOW);
    });

    it('classifies no operation both ways', () => {
      const both = [...WAVE2_WITHHELD_PUBLIC_OPERATIONS].filter((id) =>
        WAVE1_RELEASED_PUBLIC_OPERATIONS.has(id),
      );
      expect(both).toEqual([]);
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

    it('refuses every one of the 31 withheld operations', () => {
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

    /** §12 — temporary, and owned by APP12-B04. */
    it('withholds publicSecureLink_resolve as a whole operation', () => {
      expect(WAVE2_WITHHELD_PUBLIC_OPERATIONS.has(SECURE_LINK_REOPEN_OBLIGATION.operationId)).toBe(
        true,
      );
      expect(SECURE_LINK_REOPEN_OBLIGATION.owner).toBe('APP12-B04');
      expect(SECURE_LINK_REOPEN_OBLIGATION.requiredRule).toBe('GATE_BY_SCOPE_KIND');
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

import {
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import {
  CUSTOM_EMBROIDERY_RELEASE_CONFIG,
  type CustomEmbroideryReleaseConfig,
} from '../../config/custom-embroidery-release.config';
import { createOperationId } from '../../openapi/operation-id';
import { StructuredLogger } from '../logging/structured-logger.service';
import { isWave2WithheldOperation } from './wave2-operation-authority';

/**
 * The API half of the Wave-2 release gate (`APP12-G02`).
 *
 * One guard, registered globally, deciding one question: may this operation run
 * while Wave 2 is unreleased? `APP12-RELEASE-WAVE-AUTHORITY.md` §4 requires the
 * decision at the API level *independently of the route* — "a blocked route with
 * a live API is not blocked" — and §7 names the exact operations it applies to.
 *
 * ## What it does *not* decide, since `APP12-B04`
 *
 * Three public operations take a secure-link token and serve **both** waves
 * through one operation: the resolver and the two halves of the attempt-scoped
 * evidence lane. Their wave is a property of the grant row, which does not exist
 * until the token has been digested and looked up — and this guard runs before
 * the pipes, so it has nothing to decide with. They are therefore absent from
 * `WAVE2_WITHHELD_PUBLIC_OPERATIONS`, listed in
 * `SCOPE_GATED_PUBLIC_OPERATIONS`, admitted here, and refused by
 * `GrantScopeReleaseGate` inside the resolution path when the resolved scope is
 * `REQUEST_ACCESS` and Wave 2 is unreleased. That refusal is the
 * indistinguishable `SECURE_LINK_UNAVAILABLE`, which is stronger than the
 * generic 404 below: a valid custom link must not be distinguishable from a
 * fictional one while its wave is withheld.
 *
 * ## Why a guard, and why global
 *
 * A guard runs before the pipes, the interceptors and the handler, so a withheld
 * operation is refused **before any business execution**: no session is
 * authorized, no request is created, no payment attempt is opened, no row is
 * read. Nest runs global guards ahead of controller- and route-scoped ones, so
 * this decision also precedes every delivered authorization guard — which is the
 * right order. Whether a caller holds a valid grant is a question about a
 * capability that, in Wave 1, is not released to be asked about.
 *
 * The alternative — one inline conditional per withheld handler — was rejected by §14
 * and would be unauditable: the failure it invites is the 32nd operation that
 * nobody remembers to guard. It is also not a feature-flag platform. There is no
 * registry, no per-request evaluation, no remote source and no second flag; the
 * release state is read once when the module is composed.
 *
 * ## How an operation is identified
 *
 * By its canonical operation id, derived with `createOperationId` — the same
 * function `SwaggerModule` uses to mint the ids in the published document and
 * the generated client. Identity therefore comes from the same source as the
 * contract rather than from a path pattern parsed twice: a URL shape can change
 * with a routing decision, and a prefix match cannot separate
 * `publicProductPlacement_get` from `publicProduct_detail`.
 *
 * ## What a denial says
 *
 * `404` with the platform's generic not-found envelope, and nothing else. §13
 * forbids leaking the flag name, the release wave, the operation matrix or the
 * configured value, and it rules out `403 "custom embroidery disabled"` and
 * `503 "feature unavailable"` for the same reason: Wave 2 is not released, so
 * from the outside there is nothing there. A refusal that explains itself would
 * publish the release plan to anyone who probed for it.
 *
 * The reason is recorded in the structured log instead, where it is operationally
 * useful and not customer-visible. The record names the operation id and nothing
 * about the caller: correlation is already stamped by the logger.
 */
@Injectable()
export class CustomCapabilityReleaseGuard implements CanActivate {
  constructor(
    @Inject(CUSTOM_EMBROIDERY_RELEASE_CONFIG)
    private readonly release: CustomEmbroideryReleaseConfig,
    private readonly logger: StructuredLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Released: the gate is inert and every delivered behaviour is unchanged.
    // Checked first so the enabled path costs one boolean read.
    if (this.release.enabled) {
      return true;
    }

    // Only HTTP has an operation id. A microservice or RPC context would have no
    // controller/handler pair this function could name, and the API publishes
    // none; admitting them is the honest answer rather than guessing an id.
    if (context.getType() !== 'http') {
      return true;
    }

    const operationId = createOperationId(context.getClass().name, context.getHandler().name);
    if (!isWave2WithheldOperation(operationId)) {
      return true;
    }

    this.logger.info(
      'release.gate.withheld',
      'Refused a Wave-2 operation while the custom embroidery capability is unreleased.',
      { attributes: { operationId } },
    );

    // No message, no code, no detail: the platform mapper renders the generic
    // NOT_FOUND envelope, identical to any unknown resource.
    throw new NotFoundException();
  }
}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PublishApp4PolicyUseCase } from './publish-app4-policy.use-case';
import { PublishApp6PolicyUseCase } from './publish-app6-policy.use-case';
import { PublishWorkerRuntimePolicyUseCase } from './publish-worker-runtime-policy.use-case';

/**
 * Business policy configuration (AGG-23, `APP4-B01-C1`).
 *
 * Publishes versioned policy values; it reads none. Consumers resolve their own
 * values through `PolicyConfigurationRepository` at the point of use, which is
 * how `worker.runtime` already works — there is no policy cache here and no
 * runtime fallback constant anywhere.
 *
 * No controller: publication is a bootstrap action, not a request.
 *
 * `APP6-B01` added the second publisher here rather than a second module: one
 * module owning policy publication is the reason a third dataset cannot quietly
 * acquire its own platform. `APP12-H03-C1` added exactly that third one —
 * `worker.runtime`, which `APP2-I02` defined, every worker reads and nothing has
 * ever published — here, on the same terms and with no new mechanism.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    PublishApp4PolicyUseCase,
    PublishApp6PolicyUseCase,
    PublishWorkerRuntimePolicyUseCase,
  ],
  exports: [PublishApp4PolicyUseCase, PublishApp6PolicyUseCase, PublishWorkerRuntimePolicyUseCase],
})
export class PolicyModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PublishApp4PolicyUseCase } from './publish-app4-policy.use-case';

/**
 * Business policy configuration (AGG-23, `APP4-B01-C1`).
 *
 * Publishes versioned policy values; it reads none. Consumers resolve their own
 * values through `PolicyConfigurationRepository` at the point of use, which is
 * how `worker.runtime` already works — there is no policy cache here and no
 * runtime fallback constant anywhere.
 *
 * No controller: publication is a bootstrap action, not a request.
 */
@Module({
  imports: [DatabaseModule],
  providers: [PublishApp4PolicyUseCase],
  exports: [PublishApp4PolicyUseCase],
})
export class PolicyModule {}

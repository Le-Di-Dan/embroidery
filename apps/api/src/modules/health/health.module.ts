import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { HealthController } from './health.controller';
import { ShutdownStateService } from './shutdown-state.service';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [ShutdownStateService],
})
export class HealthModule {}

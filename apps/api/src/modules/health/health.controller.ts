import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { DatabaseHealth } from '@embroidery/persistence';
import { DatabaseHealthService } from '@embroidery/persistence';

import { HealthStatusResponse, ReadinessStatusResponse } from './health-response.dto';

/**
 * Health endpoints, served under the global `api` prefix (D-036).
 *
 * Uses a simple stable shape instead of the standard API envelope — an
 * explicitly allowed exception for platform tooling (BACKEND_CONVENTIONS.md §6,
 * D-034).
 *
 * Liveness and readiness are separate on purpose: liveness answers "is this
 * process alive" and must not fail when a dependency is down, or an orchestrator
 * will restart a healthy process it cannot help. Readiness answers "can this
 * process serve traffic", which does depend on the database.
 */
export interface HealthStatus {
  status: 'ok';
  service: 'api';
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  service: 'api';
  timestamp: string;
  database: DatabaseHealth;
}

/** Structural type: avoids importing an HTTP-server type into the module. */
interface StatusSettableResponse {
  status(code: number): unknown;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  @Get()
  @ApiOkResponse({
    type: HealthStatusResponse,
    description: 'The process is alive. Does not depend on any downstream dependency.',
  })
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'api',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  @ApiOkResponse({
    type: ReadinessStatusResponse,
    description: 'The process can serve traffic; the database is reachable.',
  })
  @ApiServiceUnavailableResponse({
    type: ReadinessStatusResponse,
    description: 'The database is unreachable, so the instance withdraws from rotation.',
  })
  async readiness(
    @Res({ passthrough: true }) response: StatusSettableResponse,
  ): Promise<ReadinessStatus> {
    const database = await this.databaseHealth.check();

    // `degraded` still serves traffic — the database is reachable and the pool
    // is merely contended. Only `down` withdraws the instance from rotation.
    const ready = database.status !== 'down';
    response.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: ready ? 'ready' : 'not_ready',
      service: 'api',
      timestamp: new Date().toISOString(),
      database,
    };
  }
}

import { Controller, Get } from '@nestjs/common';

/**
 * Health/liveness endpoint, served as GET /api/health (the global `api`
 * prefix is applied in main.ts per D-036). Uses a simple stable shape
 * instead of the standard API envelope — an explicitly allowed exception
 * for platform tooling (BACKEND_CONVENTIONS.md §6, D-034).
 */
export interface HealthStatus {
  status: 'ok';
  service: 'api';
  uptimeSeconds: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'api',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

import os from 'node:os';
import process from 'node:process';

/**
 * Environment capture. Numbers are meaningless without it, so it is mandatory.
 *
 * `host*` fields always describe the machine this script runs on. When the
 * browsers run in a container, the container's own OS/Node are recorded
 * separately rather than silently reporting the host's — the host CPU and memory
 * are still the real constraint, because the container shares them.
 */
export function captureEnvironment({ runner, projects, guest }) {
  const cpu = os.cpus();
  return {
    capturedAt: new Date().toISOString(),
    runner,
    projects,
    hostOs: `${os.type()} ${os.release()}`,
    hostPlatform: process.platform,
    hostArch: process.arch,
    hostNodeVersion: process.version,
    cpuModel: cpu[0]?.model ?? 'unknown',
    cpuCores: cpu.length,
    totalMemoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    headless: true,
    cpuThrottling: 'none',
    networkThrottling: 'none',
    powerMode: 'unspecified (developer workstation defaults, mains power)',
    ...guest,
  };
}

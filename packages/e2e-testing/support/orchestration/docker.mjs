/**
 * Docker Compose lifecycle for the isolated E2E edge — the ephemeral PostgreSQL
 * and the real Nginx gateway. Compose owns only infrastructure that must run in
 * a container (the gateway is the real image; Postgres is ephemeral/tmpfs); the
 * apps and API run as host processes. Every project is namespaced by run id so
 * concurrent runs never collide, and teardown always uses `down -v`.
 */
import { spawn } from 'node:child_process';

import { delay } from './net.mjs';

function runDockerCapture(args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(`docker ${args.slice(0, 2).join(' ')} failed: ${stderr.trim().slice(-300)}`),
        );
      }
    });
  });
}

/** Waits until a Compose service's container reports a healthy healthcheck. */
export async function waitForHealthy({
  projectName,
  file,
  service,
  env,
  timeoutMs = 90_000,
  intervalMs = 1_500,
}) {
  const id = await runDockerCapture(
    ['compose', '-p', projectName, '-f', file, 'ps', '-q', service],
    {
      env,
    },
  );
  if (id === '') {
    throw new Error(`Compose service "${service}" has no container in project ${projectName}.`);
  }
  const deadline = Date.now() + timeoutMs;
  let last = 'unknown';
  while (Date.now() < deadline) {
    last = await runDockerCapture([
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
      id,
    ]);
    if (last === 'healthy') {
      return;
    }
    await delay(intervalMs);
  }
  throw new Error(
    `Compose service "${service}" did not become healthy in ${timeoutMs}ms (last: ${last}).`,
  );
}

function runDocker(args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `docker ${args.slice(0, 3).join(' ')} exited with code ${code}: ${stderr.trim().slice(-400)}`,
          ),
        );
      }
    });
  });
}

/** Verifies the Docker daemon is reachable before any destructive setup. */
export async function assertDockerAvailable() {
  try {
    await runDocker(['version', '--format', '{{.Server.Version}}']);
  } catch (error) {
    throw new Error(
      `Docker is required for the E2E gateway/database but is not available: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function composeUp({ projectName, file, services = [], env }) {
  return runDocker(['compose', '-p', projectName, '-f', file, 'up', '-d', ...services], { env });
}

export function composeDown({ projectName, file, env }) {
  return runDocker(['compose', '-p', projectName, '-f', file, 'down', '-v', '--remove-orphans'], {
    env,
  });
}

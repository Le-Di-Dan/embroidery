/**
 * Disposable MinIO for the APP2-I01 contract suite (§14).
 *
 * Mirrors the repository's existing disposable-infrastructure pattern (the DB7
 * harness and the E2E orchestrator): a pinned image, a random loopback port, a
 * run-scoped name, readiness by polling a real signal rather than sleeping, and
 * teardown that always runs. Testcontainers is not used — the project has no
 * evidence for adding it, and `docker run` is what the rest of the repository
 * already does.
 *
 * The container never touches the normal development stack: a different name,
 * a different port, no compose project, and no named volume.
 */
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import net from 'node:net';

/** The exact release the development Compose service runs (§11). */
export const MINIO_IMAGE = 'minio/minio:RELEASE.2025-04-08T15-41-24Z';

/** Local-only, generated per run — never a real credential. */
export const TEST_ACCESS_KEY_ID = 'i01contractkey';
export const TEST_SECRET_ACCESS_KEY = 'i01-contract-local-secret';

export interface DisposableMinio {
  readonly endpoint: string;
  readonly port: number;
  readonly containerName: string;
  readonly originalsBucket: string;
  readonly derivativesBucket: string;
  /** Removes the container and its anonymous volume. Safe to call twice. */
  stop(): Promise<void>;
}

function runDocker(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...args], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`docker ${args[0] ?? ''} failed (${String(code)}): ${stderr.trim()}`));
      }
    });
  });
}

export async function assertDockerAvailable(): Promise<void> {
  try {
    await runDocker(['version', '--format', '{{.Server.Version}}']);
  } catch (error: unknown) {
    throw new Error(
      'The object-storage contract suite requires a reachable Docker daemon. ' +
        `Start Docker and retry: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Asks the OS for a free loopback port, then releases it for the container. */
function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a loopback port for MinIO.'));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Polls MinIO's official readiness endpoint. Deterministic: a real signal with
 * a bounded deadline, never a fixed sleep.
 */
async function waitForReady(endpoint: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastReason = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/minio/health/ready`);
      if (response.ok) {
        return;
      }
      lastReason = `status ${String(response.status)}`;
    } catch (error: unknown) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`MinIO did not become ready within ${String(timeoutMs)}ms: ${lastReason}.`);
}

export async function startDisposableMinio(): Promise<DisposableMinio> {
  await assertDockerAvailable();

  const runId = randomUUID().slice(0, 8);
  const containerName = `embroidery-i01-minio-${runId}`;
  const port = await reserveLoopbackPort();
  const endpoint = `http://127.0.0.1:${String(port)}`;

  await runDocker([
    'run',
    '--detach',
    '--name',
    containerName,
    // Loopback only: the disposable store is never reachable off this machine.
    '--publish',
    `127.0.0.1:${String(port)}:9000`,
    '--env',
    `MINIO_ROOT_USER=${TEST_ACCESS_KEY_ID}`,
    '--env',
    `MINIO_ROOT_PASSWORD=${TEST_SECRET_ACCESS_KEY}`,
    MINIO_IMAGE,
    'server',
    '/data',
  ]);

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;
    // `-v` also drops the container's anonymous volume, so no storage residue
    // survives the run.
    await runDocker(['rm', '--force', '--volumes', containerName]);
  };

  try {
    await waitForReady(endpoint);
  } catch (error: unknown) {
    await stop();
    throw error;
  }

  return {
    endpoint,
    port,
    containerName,
    // Unique per run: a leftover bucket from an earlier run can never make a
    // later assertion pass.
    originalsBucket: `i01-${runId}-originals`,
    derivativesBucket: `i01-${runId}-derivatives`,
    stop,
  };
}

/** True when no container with this name exists any more (running or exited). */
export async function containerExists(name: string): Promise<boolean> {
  const output = await runDocker(['ps', '--all', '--quiet', '--filter', `name=^${name}$`]);
  return output !== '';
}

export async function listVolumesNamed(name: string): Promise<string> {
  return runDocker(['volume', 'ls', '--quiet', '--filter', `name=${name}`]);
}

/** True when nothing accepts a loopback connection on the port. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const finish = (result: boolean): void => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      finish(false);
    });
    socket.once('timeout', () => {
      finish(true);
    });
    socket.once('error', () => {
      finish(true);
    });
  });
}

/**
 * RFC 9562 UUIDv7. Node 22 has no built-in v7 generator and the key builders
 * reject anything else, so the suite mints real ones rather than weakening the
 * validator for tests.
 */
export function uuidV7(): string {
  const bytes = randomBytes(16);
  const timestamp = Date.now();
  bytes.writeUIntBE(timestamp, 0, 6);
  // Version 7 in the high nibble of byte 6; RFC 4122 variant `10xx` in byte 8.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

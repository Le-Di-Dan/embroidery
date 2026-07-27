/**
 * Disposable MinIO for the APP2-B01 asset-intake suites (§25).
 *
 * Deliberately API-local rather than imported from `@embroidery/object-storage`:
 * that package exposes no testing entry point, and reaching into another
 * workspace's `test/` directory would couple two packages' private test
 * infrastructure. The pattern is the repository's existing one — pinned image,
 * random loopback port, run-scoped names, readiness by polling a real signal,
 * teardown that always runs, no Testcontainers.
 *
 * The container never touches the development stack: different name, different
 * port, no compose project, no named volume.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

/** The exact release the development Compose service runs. */
export const MINIO_IMAGE = 'minio/minio:RELEASE.2025-04-08T15-41-24Z';

/** Local-only, never a real credential. */
export const TEST_ACCESS_KEY_ID = 'b01intakekey';
export const TEST_SECRET_ACCESS_KEY = 'b01-intake-local-secret';

export interface DisposableMinio {
  readonly endpoint: string;
  readonly port: number;
  readonly containerName: string;
  readonly originalsBucket: string;
  readonly derivativesBucket: string;
  /** Removes the container and its anonymous volume. Safe to call twice. */
  stop(): Promise<void>;
}

export function runDocker(args: readonly string[]): Promise<string> {
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
      'The asset-intake integration suite requires a reachable Docker daemon. ' +
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

/** Polls MinIO's official readiness endpoint — a real signal, never a sleep. */
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
  const containerName = `embroidery-b01-minio-${runId}`;
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
    // Unique per run: a leftover bucket cannot make a later assertion pass.
    originalsBucket: `b01-${runId}-originals`,
    derivativesBucket: `b01-${runId}-derivatives`,
    stop,
  };
}

/** True when a container with this name still exists (running or exited). */
export async function containerExists(name: string): Promise<boolean> {
  const output = await runDocker(['ps', '--all', '--quiet', '--filter', `name=^${name}$`]);
  return output !== '';
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

/** The environment an application graph needs to reach this instance. */
export function minioEnv(minio: DisposableMinio): Record<string, string> {
  return {
    OBJECT_STORAGE_PROVIDER: 's3',
    OBJECT_STORAGE_ENDPOINT: minio.endpoint,
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_ACCESS_KEY_ID: TEST_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: TEST_SECRET_ACCESS_KEY,
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    OBJECT_STORAGE_ORIGINALS_BUCKET: minio.originalsBucket,
    OBJECT_STORAGE_DERIVATIVES_BUCKET: minio.derivativesBucket,
  };
}

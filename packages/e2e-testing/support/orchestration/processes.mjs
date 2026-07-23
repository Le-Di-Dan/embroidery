/**
 * Host-process lifecycle for the API and the two Next apps (production
 * `next start` / `node dist/main.js`). The orchestrator owns every process it
 * starts and stops the whole tree — Playwright's own web-server shutdown is
 * explicitly not relied upon (it is insufficient on Windows).
 */
import { spawn } from 'node:child_process';

const STOP_GRACE_MS = 6_000;
const MAX_LOG_LINES = 40;

/**
 * Starts a child process, capturing a bounded, redacted-by-caller log tail.
 * On POSIX the child leads its own process group (`detached`) so the whole tree
 * can be signalled; on Windows the tree is killed with `taskkill /T /F`.
 * @returns {{ name: string, pid: number|undefined, tail: () => string, stop: () => Promise<void>, child: import('node:child_process').ChildProcess }}
 */
export function startProcess({ name, command, args, cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    shell: false,
  });

  const lines = [];
  const capture = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim() === '') {
        continue;
      }
      lines.push(line);
      if (lines.length > MAX_LOG_LINES) {
        lines.shift();
      }
    }
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  return {
    name,
    pid: child.pid,
    child,
    tail: () => lines.slice(-MAX_LOG_LINES).join('\n'),
    stop: () => stopProcess(child),
  };
}

/** Stops a child and its subtree, cross-platform, with a bounded hard-kill fallback. */
export function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
      resolve();
      return;
    }
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    child.once('exit', settle);

    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      // Already gone.
    }

    setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          child.kill('SIGKILL');
        } else {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {
        // Already gone.
      }
      settle();
    }, STOP_GRACE_MS);
  });
}

/**
 * `APP2-T01-C1` — the harness's only channel to Docker, and the non-secret
 * runtime facts it reads back.
 *
 * Separated from the orchestration so that redaction is structural rather than
 * remembered: every `docker` invocation in this harness goes through `run`, and
 * `run` redacts before the caller can print. A future step that shells out
 * directly would stand out in review.
 *
 * Every fact gathered here is deliberately non-secret — a container's command,
 * image identity, mount destinations, `NODE_ENV`, health status. That is the
 * whole evidence set the correction needs, and none of it requires reading a
 * credential or adding a diagnostic endpoint to the application.
 */
import { spawnSync } from 'node:child_process';

import {
  API_CONTAINER,
  REPO_ROOT,
  classifyApiRuntime,
  redactSecrets,
} from './smoke-app2-t01-production-topology.mjs';

/**
 * Builds the Docker runner bound to this run's secret list. The list is held by
 * reference, so a secret appended after construction is still redacted.
 */
export function createDockerFacts(secrets) {
  function run(args, opts = {}) {
    const res = spawnSync('docker', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      ...opts,
    });
    return {
      status: res.status ?? 1,
      stdout: redactSecrets(res.stdout ?? '', secrets),
      stderr: redactSecrets(res.stderr ?? '', secrets),
    };
  }

  function inspect(format, container) {
    return run(['inspect', '-f', format, container]).stdout.trim();
  }

  /** Non-secret runtime facts about whichever container currently owns `api`. */
  function apiRuntimeFacts() {
    const command = inspect('{{join .Config.Cmd " "}}', API_CONTAINER);
    const image = inspect('{{.Config.Image}}', API_CONTAINER);
    const imageId = inspect('{{.Image}}', API_CONTAINER).slice(0, 19);
    const mounts = inspect('{{range .Mounts}}{{.Destination}} {{end}}', API_CONTAINER)
      .split(/\s+/)
      .filter(Boolean);
    const nodeEnv = run(['exec', API_CONTAINER, 'printenv', 'NODE_ENV']).stdout.trim();
    return {
      command,
      image,
      imageId,
      nodeEnv,
      mounts,
      mountCount: mounts.length,
      kind: classifyApiRuntime({ command, nodeEnv, mountCount: mounts.length }),
    };
  }

  function containerHealth(name) {
    return inspect('{{.State.Health.Status}}', name);
  }

  /** Image ids currently matching a `reference=` filter. */
  function imageIds(prefix) {
    return run(['images', '--filter', `reference=${prefix}`, '-q'])
      .stdout.trim()
      .split('\n')
      .filter(Boolean);
  }

  /** Container ids currently matching a `name=` filter, running or not. */
  function containerIds(name) {
    return run(['ps', '-aq', '--filter', `name=${name}`])
      .stdout.trim()
      .split('\n')
      .filter(Boolean);
  }

  return { run, apiRuntimeFacts, containerHealth, imageIds, containerIds };
}

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Canonical artifact location and drift comparison (APP0-B01).
 *
 * `packages/contracts` is the cross-application contract owner, so the generated
 * OpenAPI document lives there rather than in the API app or a build directory.
 * The path is resolved from the repository root (located by walking up to the
 * pnpm workspace marker) so the generator and checker work regardless of the
 * process working directory.
 */
export const OPENAPI_ARTIFACT_RELATIVE_PATH = 'packages/contracts/openapi/openapi.generated.json';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

export function findRepositoryRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not locate ${WORKSPACE_MARKER} above ${startDir}.`);
    }
    current = parent;
  }
}

export function resolveArtifactPath(startDir: string): string {
  const root = findRepositoryRoot(startDir);
  return join(root, ...OPENAPI_ARTIFACT_RELATIVE_PATH.split('/'));
}

export function readCommittedArtifact(artifactPath: string): string | null {
  return existsSync(artifactPath) ? readFileSync(artifactPath, 'utf8') : null;
}

export type ArtifactDriftReason = 'missing' | 'stale';

export interface ArtifactComparison {
  readonly matches: boolean;
  readonly reason?: ArtifactDriftReason;
}

/**
 * Compares the committed artifact against a freshly generated candidate without
 * touching the working tree. `null` committed content means the artifact has
 * not been generated yet.
 */
export function compareArtifact(committed: string | null, candidate: string): ArtifactComparison {
  if (committed === null) {
    return { matches: false, reason: 'missing' };
  }
  if (committed !== candidate) {
    return { matches: false, reason: 'stale' };
  }
  return { matches: true };
}

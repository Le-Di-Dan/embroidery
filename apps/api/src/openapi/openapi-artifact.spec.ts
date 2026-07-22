import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  OPENAPI_ARTIFACT_RELATIVE_PATH,
  compareArtifact,
  findRepositoryRoot,
  readCommittedArtifact,
  resolveArtifactPath,
} from './openapi-artifact';

describe('compareArtifact', () => {
  it('passes when the committed artifact matches the candidate', () => {
    expect(compareArtifact('same\n', 'same\n')).toEqual({ matches: true });
  });

  it('fails as stale when the committed artifact differs', () => {
    expect(compareArtifact('old\n', 'new\n')).toEqual({ matches: false, reason: 'stale' });
  });

  it('fails as missing when the artifact has never been generated', () => {
    expect(compareArtifact(null, 'new\n')).toEqual({ matches: false, reason: 'missing' });
  });

  it('treats a whitespace-only difference as drift', () => {
    expect(compareArtifact('{}\n', '{}')).toEqual({ matches: false, reason: 'stale' });
  });
});

describe('resolveArtifactPath', () => {
  it('resolves the canonical contract path from anywhere inside the repository', () => {
    const fromHere = resolveArtifactPath(__dirname);
    const root = findRepositoryRoot(__dirname);
    expect(fromHere).toBe(join(root, ...OPENAPI_ARTIFACT_RELATIVE_PATH.split('/')));
  });

  it('points at a committed artifact that exists and is readable', () => {
    const artifactPath = resolveArtifactPath(__dirname);
    expect(existsSync(artifactPath)).toBe(true);
    expect(readCommittedArtifact(artifactPath)).not.toBeNull();
  });

  it('reports a missing artifact as null rather than throwing', () => {
    expect(readCommittedArtifact(join(__dirname, 'does-not-exist.json'))).toBeNull();
  });
});

/**
 * The migration registry, exercised now so v2 does not have to invent it.
 *
 * Since v1 has no steps, most of these use *synthetic* step lists. That is
 * deliberate: the registry's contract — contiguous, single-version, ordered,
 * output validated, input untouched — is what a future checkpoint will rely on,
 * and testing it only against an empty list would prove nothing about the day it
 * stops being empty.
 */
import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '../schema/constants';
import { documentWith, emptyDocument, textElement } from '../testing/fixtures';
import {
  DESIGN_DOCUMENT_MIGRATIONS,
  DesignDocumentMigrationRegistryError,
  assertContiguous,
  migrateDesignDocument,
  type DesignDocumentMigrationStep,
} from './registry';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('the v1 registry', () => {
  it('has no steps, because there is no earlier deployed version', () => {
    expect(DESIGN_DOCUMENT_MIGRATIONS).toEqual([]);
    expect(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION).toBe(1);
  });

  it('round-trips a current-version document into a validated value', () => {
    const result = migrateDesignDocument(documentWith([textElement()]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1);
      expect(result.value.elements).toHaveLength(1);
    }
  });

  it('validates its output rather than passing a payload through', () => {
    const result = migrateDesignDocument({ ...emptyDocument(), elements: [{ id: 'broken' }] });
    expect(result.ok).toBe(false);
  });

  it('fails a missing version', () => {
    const { schemaVersion: _drop, ...rest } = emptyDocument();
    const result = migrateDesignDocument(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings[0]?.code).toBe('UNSUPPORTED_SCHEMA_VERSION');
  });

  it('fails a future version with UNSUPPORTED_SCHEMA_VERSION', () => {
    const result = migrateDesignDocument({ ...emptyDocument(), schemaVersion: 7 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings[0]?.code).toBe('UNSUPPORTED_SCHEMA_VERSION');
  });

  it('does not mutate the payload it reads', () => {
    const payload = documentWith([textElement()]);
    const before = clone(payload);
    migrateDesignDocument(payload);
    expect(payload).toEqual(before);
  });
});

describe('registry shape', () => {
  const step = (from: number, to: number): DesignDocumentMigrationStep => ({
    from,
    to,
    migrate: (payload) => ({ ...payload, schemaVersion: to }),
  });

  it('rejects a skipped version', () => {
    // 1 → 3 would silently omit whatever v2 introduced.
    expect(() => {
      assertContiguous([step(1, 3)]);
    }).toThrow(DesignDocumentMigrationRegistryError);
  });

  it('rejects a gap between steps', () => {
    expect(() => {
      assertContiguous([step(1, 2), step(3, 4)]);
    }).toThrow(DesignDocumentMigrationRegistryError);
  });

  it('rejects steps that do not start at version 1', () => {
    expect(() => {
      assertContiguous([step(2, 3)]);
    }).toThrow(DesignDocumentMigrationRegistryError);
  });

  it('rejects a chain that overshoots the current version', () => {
    expect(() => {
      assertContiguous([step(1, 2)]);
    }).toThrow(DesignDocumentMigrationRegistryError);
  });

  it('accepts the empty chain at v1', () => {
    expect(() => {
      assertContiguous([]);
    }).not.toThrow();
  });
});

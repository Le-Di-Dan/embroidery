import {
  buildAcceptedDetail,
  buildRejectedDetail,
  encodeInspectionDetail,
  type InspectedDerivative,
  type InspectedSource,
} from '../../domain/inspection-detail';
import { AssetInspectionContradictionError } from '../../domain/inspection-contradiction';
import { CATALOG_INSPECTION_LANE } from '../../domain/asset-inspection-lane';
import type { DerivativeRowState } from '../../domain/repositories/asset-inspection.repository';
import {
  verifyAcceptedReplay,
  verifyRejectedReplay,
  type ExpectedDerivativeKeys,
  type InspectionRow,
} from './terminal-replay';

const ASSET_ID = '0195f0a6-8f2a-7c3b-9d41-6a2f0b7c1d84';

const KEYS: ExpectedDerivativeKeys = {
  THUMBNAIL: `test/derivatives/${ASSET_ID}/THUMBNAIL.webp`,
  CATALOG_PREVIEW: `test/derivatives/${ASSET_ID}/CATALOG_PREVIEW.webp`,
};

const THUMB_CHECKSUM = `sha256:${'1'.repeat(64)}`;
const PREVIEW_CHECKSUM = `sha256:${'2'.repeat(64)}`;

const SOURCE: InspectedSource = {
  mediaType: 'image/png',
  format: 'png',
  byteSize: 1024,
  checksum: `sha256:${'3'.repeat(64)}`,
  width: 800,
  height: 600,
  orientedWidth: 800,
  orientedHeight: 600,
  channels: 4,
  pages: 1,
};

const RECORDED: InspectedDerivative[] = [
  {
    kind: 'THUMBNAIL',
    mediaType: 'image/webp',
    width: 480,
    height: 360,
    byteSize: 900,
    checksum: THUMB_CHECKSUM,
    isWatermarked: false,
  },
  {
    kind: 'CATALOG_PREVIEW',
    mediaType: 'image/webp',
    width: 800,
    height: 600,
    byteSize: 5000,
    checksum: PREVIEW_CHECKSUM,
    isWatermarked: false,
  },
];

function acceptedInspection(): InspectionRow[] {
  return [
    {
      outcome: 'ACCEPTED',
      detail: encodeInspectionDetail(
        buildAcceptedDetail({ source: SOURCE, derivatives: RECORDED }),
      ),
    },
  ];
}

function rejectedInspection(): InspectionRow[] {
  return [
    {
      outcome: 'REJECTED',
      detail: encodeInspectionDetail(
        buildRejectedDetail({ rejectionCode: 'DECODE_FAILED', cleanupPending: false }),
      ),
    },
  ];
}

function readyRows(overrides: Partial<DerivativeRowState> = {}): DerivativeRowState[] {
  return [
    {
      kind: 'THUMBNAIL',
      status: 'READY',
      storageKey: KEYS.THUMBNAIL,
      checksum: THUMB_CHECKSUM,
      isWatermarked: false,
      ...overrides,
    },
    {
      kind: 'CATALOG_PREVIEW',
      status: 'READY',
      storageKey: KEYS.CATALOG_PREVIEW,
      checksum: PREVIEW_CHECKSUM,
      isWatermarked: false,
    },
  ];
}

function failedRows(): DerivativeRowState[] {
  return [
    {
      kind: 'THUMBNAIL',
      status: 'FAILED',
      storageKey: null,
      checksum: null,
      isWatermarked: false,
    },
    {
      kind: 'CATALOG_PREVIEW',
      status: 'FAILED',
      storageKey: null,
      checksum: null,
      isWatermarked: false,
    },
  ];
}

function expectContradiction(work: () => unknown, reason: RegExp): void {
  expect(work).toThrow(AssetInspectionContradictionError);
  expect(work).toThrow(reason);
}

describe('verifyAcceptedReplay', () => {
  it('returns both deterministic keys for a complete effect', () => {
    expect(
      verifyAcceptedReplay(acceptedInspection(), readyRows(), KEYS, CATALOG_INSPECTION_LANE),
    ).toEqual([KEYS.THUMBNAIL, KEYS.CATALOG_PREVIEW]);
  });

  it('stops when the terminal asset has no inspection', () => {
    expectContradiction(
      () => verifyAcceptedReplay([], readyRows(), KEYS, CATALOG_INSPECTION_LANE),
      /no inspection/,
    );
  });

  it('stops on duplicate inspections', () => {
    const duplicated = [...acceptedInspection(), ...acceptedInspection()];

    expectContradiction(
      () => verifyAcceptedReplay(duplicated, readyRows(), KEYS, CATALOG_INSPECTION_LANE),
      /duplicate inspections/,
    );
  });

  it('stops when the inspection outcome contradicts the asset state', () => {
    expectContradiction(
      () => verifyAcceptedReplay(rejectedInspection(), readyRows(), KEYS, CATALOG_INSPECTION_LANE),
      /outcome does not match/,
    );
  });

  it('stops on a malformed or foreign-schema detail', () => {
    expectContradiction(
      () =>
        verifyAcceptedReplay(
          [{ outcome: 'ACCEPTED', detail: '{}' }],
          readyRows(),
          KEYS,
          CATALOG_INSPECTION_LANE,
        ),
      /malformed or of an unsupported schema/,
    );
    expectContradiction(
      () =>
        verifyAcceptedReplay(
          [{ outcome: 'ACCEPTED', detail: null }],
          readyRows(),
          KEYS,
          CATALOG_INSPECTION_LANE,
        ),
      /malformed or of an unsupported schema/,
    );
  });

  it('stops when a derivative is missing', () => {
    const [thumbnail] = readyRows();

    expectContradiction(
      () =>
        verifyAcceptedReplay(
          acceptedInspection(),
          [thumbnail as DerivativeRowState],
          KEYS,
          CATALOG_INSPECTION_LANE,
        ),
      /missing a derivative/,
    );
  });

  it('stops when an accepted derivative is not READY', () => {
    expectContradiction(
      () =>
        verifyAcceptedReplay(
          acceptedInspection(),
          readyRows({ status: 'PROCESSING' }),
          KEYS,
          CATALOG_INSPECTION_LANE,
        ),
      /not READY/,
    );
  });

  it('stops when a catalog derivative claims a watermark', () => {
    expectContradiction(
      () =>
        verifyAcceptedReplay(
          acceptedInspection(),
          readyRows({ isWatermarked: true }),
          KEYS,
          CATALOG_INSPECTION_LANE,
        ),
      /marked watermarked/,
    );
  });

  it('stops when the row points somewhere other than the deterministic key', () => {
    expectContradiction(
      () =>
        verifyAcceptedReplay(
          acceptedInspection(),
          readyRows({ storageKey: 'test/derivatives/elsewhere/THUMBNAIL.webp' }),
          KEYS,
          CATALOG_INSPECTION_LANE,
        ),
      /not the deterministic key/,
    );
  });

  it('stops when the row checksum disagrees with the record', () => {
    expectContradiction(
      () =>
        verifyAcceptedReplay(
          acceptedInspection(),
          readyRows({ checksum: `sha256:${'9'.repeat(64)}` }),
          KEYS,
          CATALOG_INSPECTION_LANE,
        ),
      /checksum disagrees/,
    );
  });

  it('stops when two live rows exist for one kind', () => {
    const rows = [...readyRows(), ...readyRows()];

    expectContradiction(
      () => verifyAcceptedReplay(acceptedInspection(), rows, KEYS, CATALOG_INSPECTION_LANE),
      /more than one live derivative/,
    );
  });

  it('ignores FAILED lineage rows alongside the live ones', () => {
    const rows = [
      ...readyRows(),
      {
        kind: 'THUMBNAIL',
        status: 'FAILED' as const,
        storageKey: null,
        checksum: null,
        isWatermarked: false,
      },
    ];

    expect(
      verifyAcceptedReplay(acceptedInspection(), rows, KEYS, CATALOG_INSPECTION_LANE),
    ).toHaveLength(2);
  });
});

describe('verifyRejectedReplay', () => {
  it('accepts a complete rejected effect', () => {
    expect(() =>
      verifyRejectedReplay(rejectedInspection(), failedRows(), CATALOG_INSPECTION_LANE),
    ).not.toThrow();
  });

  it('accepts a rejection recorded before any derivative row existed', () => {
    expect(() =>
      verifyRejectedReplay(rejectedInspection(), [], CATALOG_INSPECTION_LANE),
    ).not.toThrow();
  });

  it('stops when a rejected asset still exposes a READY derivative', () => {
    expectContradiction(
      () => verifyRejectedReplay(rejectedInspection(), readyRows(), CATALOG_INSPECTION_LANE),
      /still exposes a READY derivative/,
    );
  });

  it('stops when a prepared derivative was never failed', () => {
    const rows: DerivativeRowState[] = [
      {
        kind: 'THUMBNAIL',
        status: 'PROCESSING',
        storageKey: null,
        checksum: null,
        isWatermarked: false,
      },
    ];

    expectContradiction(
      () => verifyRejectedReplay(rejectedInspection(), rows, CATALOG_INSPECTION_LANE),
      /not FAILED/,
    );
  });

  it('stops when the inspection says the asset was accepted', () => {
    expectContradiction(
      () => verifyRejectedReplay(acceptedInspection(), failedRows(), CATALOG_INSPECTION_LANE),
      /outcome does not match/,
    );
  });
});

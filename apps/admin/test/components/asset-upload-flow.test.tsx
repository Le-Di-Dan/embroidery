/**
 * Upload, cancellation and post-upload reconciliation on the real screen.
 *
 * The generated client is the mocked boundary; the panel, the state machine,
 * the services and the reconciliation query all run their production code.
 * Interactions use `fireEvent` rather than `user-event` so the one test that
 * needs fake timers behaves the same as the rest.
 */
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { adminAssetDetail, adminAssetList, adminAssetUpload } from '@embroidery/api-client';
import type { ApiRequestOptions } from '@embroidery/api-client';
import { act } from 'react';

import { AssetLibraryScreen } from '../../src/features/assets/components/asset-library-screen';
import { ASSET_COPY } from '../../src/features/assets/model/asset-copy';
import { ASSET_PROCESSING_POLL_INTERVAL_MS } from '../../src/features/assets/hooks/use-asset-processing-query';
import { makeApiClientError } from '../support/api-error';
import { makeAsset, makeFile, makePage } from '../support/asset-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminAssetList: jest.fn(),
  adminAssetDetail: jest.fn(),
  adminAssetUpload: jest.fn(),
}));

const listMock = adminAssetList as jest.MockedFunction<typeof adminAssetList>;
const detailMock = adminAssetDetail as jest.MockedFunction<typeof adminAssetDetail>;
const uploadMock = adminAssetUpload as jest.MockedFunction<typeof adminAssetUpload>;

const ASSET_ID = '01920000-0000-7000-8000-000000000001';
const PNG_FILE = makeFile('hoa-sen-moi.png', 'image/png', 2_000_000);

function envelope(data: unknown) {
  return {
    success: true,
    code: 'OK',
    message: 'ok',
    data,
    meta: { requestId: 'req-1', timestamp: '2026-07-27T00:00:00.000Z' },
  } as never;
}

/** Options the generated upload operation received, per attempt. */
const attempts: ApiRequestOptions[] = [];

interface Settler {
  readonly resolve: (value: never) => void;
  readonly reject: (reason: unknown) => void;
}

/** Settles the current in-flight upload. */
let settle: Settler | null = null;

/** An abort surfaces as a real `Error`, exactly as Axios reports one. */
function abortError(): Error {
  return Object.assign(new Error('canceled'), { isAxiosError: true, code: 'ERR_CANCELED' });
}

function armUpload() {
  uploadMock.mockImplementation((_body, options) => {
    const request = options as ApiRequestOptions;
    attempts.push(request);
    return new Promise<never>((resolve, reject) => {
      settle = { resolve, reject };
      (request.config?.signal as AbortSignal | undefined)?.addEventListener('abort', () => {
        reject(abortError());
      });
    });
  });
}

function idempotencyKeyOf(attempt: ApiRequestOptions): string {
  return (attempt.config?.headers as Record<string, string>)['Idempotency-Key'] as string;
}

function reportProgress(attempt: ApiRequestOptions, loaded: number, total?: number) {
  // A transport progress event originates outside React, so the resulting
  // state update is wrapped the way the runtime would batch it.
  act(() => {
    attempt.config?.onUploadProgress?.({
      loaded,
      ...(total === undefined ? {} : { total }),
    } as never);
  });
}

function selectFile(file: File) {
  const input = screen.getByLabelText(ASSET_COPY.upload.inputLabel);
  fireEvent.change(input, { target: { files: [file] } });
}

function clickButton(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  jest.clearAllMocks();
  attempts.length = 0;
  settle = null;
  listMock.mockResolvedValue(envelope(makePage([])));
  armUpload();
});

describe('file selection', () => {
  it('offers exactly the accepted media types on a labelled input', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);

    const input = screen.getByLabelText(ASSET_COPY.upload.inputLabel);
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    expect(input).not.toHaveAttribute('multiple');
    expect(input).not.toBeDisabled();
  });

  it('stages a valid file and sends nothing until the operator confirms', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);

    selectFile(PNG_FILE);

    expect(screen.getByText('Đã chọn · hoa-sen-moi.png')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file locally and never sends a request', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);

    selectFile(makeFile('cu.svg', 'image/svg+xml', 1000));

    expect(screen.getByText(ASSET_COPY.errors.mediaUnsupported)).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe('upload progress', () => {
  it('reports real transferred bytes and never shows 100% before success', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);

    const attempt = attempts[0] as ApiRequestOptions;
    reportProgress(attempt, 1_240_000, 2_000_000);
    expect(await screen.findByText('Đã tải 62% — vui lòng giữ trang này mở.')).toBeInTheDocument();

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '62');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');

    // Every byte is acknowledged, but the HTTP result has not arrived yet.
    reportProgress(attempt, 2_000_000, 2_000_000);
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '99');
    });
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });

  it('falls back to indeterminate rather than fabricating a share', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(makeFile('unknown.png', 'image/png', 0));
    clickButton(ASSET_COPY.upload.submit);

    reportProgress(attempts[0] as ApiRequestOptions, 4096);

    expect(await screen.findByText(ASSET_COPY.progress.indeterminate)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });
});

describe('processing reconciliation', () => {
  async function uploadThenAccept(status: string) {
    detailMock.mockResolvedValue(envelope(makeAsset({ assetId: ASSET_ID, status })));
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);
    settle?.resolve(
      envelope({
        assetId: ASSET_ID,
        byteSize: 2_000_000,
        checksum: 'c'.repeat(64),
        classification: 'PRODUCTION_SENSITIVE',
        kind: 'CATALOG_MEDIA',
        mediaType: 'image/png',
        status: 'INSPECTING',
      }),
    );
  }

  it('switches to server-backed identity at 202 and drops the local filename', async () => {
    detailMock.mockResolvedValue(new Promise(() => undefined) as never);
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);
    settle?.resolve(envelope({ assetId: ASSET_ID, mediaType: 'image/png', status: 'INSPECTING' }));

    expect(await screen.findByText('Đang xử lý · Ảnh PNG')).toBeInTheDocument();
    expect(screen.queryByText(/hoa-sen-moi\.png/)).not.toBeInTheDocument();
    // Indeterminate: the worker reports no percentage and none is invented.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('polls only the asset detail resource, on the one locked interval', async () => {
    jest.useFakeTimers();
    try {
      detailMock
        .mockResolvedValueOnce(envelope(makeAsset({ assetId: ASSET_ID, status: 'INSPECTING' })))
        .mockResolvedValueOnce(envelope(makeAsset({ assetId: ASSET_ID, status: 'ACCEPTED' })));
      renderWithProviders(<AssetLibraryScreen />);
      await screen.findByText(ASSET_COPY.list.emptyTitle);
      selectFile(PNG_FILE);
      clickButton(ASSET_COPY.upload.submit);
      settle?.resolve(
        envelope({ assetId: ASSET_ID, mediaType: 'image/png', status: 'INSPECTING' }),
      );

      await waitFor(() => {
        expect(detailMock).toHaveBeenCalledTimes(1);
      });
      expect(detailMock.mock.calls[0]?.[0]).toBe(ASSET_ID);
      expect(ASSET_PROCESSING_POLL_INTERVAL_MS).toBe(3000);

      const listCallsWhilePolling = listMock.mock.calls.length;
      // The timeout has to outrun one poll interval; `waitFor` advances the
      // fake clock in small steps, so nothing here depends on wall time.
      await waitFor(
        () => {
          expect(detailMock).toHaveBeenCalledTimes(2);
        },
        { timeout: ASSET_PROCESSING_POLL_INTERVAL_MS * 2 },
      );
      // The terminal answer stops the poll: no third detail request follows.
      jest.advanceTimersByTime(ASSET_PROCESSING_POLL_INTERVAL_MS * 3);
      expect(detailMock).toHaveBeenCalledTimes(2);
      // Reconciliation never polled the collection to discover the outcome.
      expect(listMock.mock.calls.length).toBeLessThanOrEqual(listCallsWhilePolling + 1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('announces acceptance politely and refreshes the authoritative list', async () => {
    await uploadThenAccept('ACCEPTED');

    expect(await screen.findByText('Sẵn sàng · Ảnh PNG')).toBeInTheDocument();
    await waitFor(() => {
      expect(listMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('states a rejection in user language with no technical detail', async () => {
    await uploadThenAccept('REJECTED');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể sử dụng · Ảnh PNG');
    expect(alert).toHaveTextContent(ASSET_COPY.rejected.description);
    expect(alert.textContent).not.toMatch(
      /bucket|s3|minio|sha|checksum|job|lease|worker|01920000/i,
    );
    // There is no delete operation in the contract, so nothing offers one.
    expect(screen.queryByRole('button', { name: /xoá|xóa/i })).not.toBeInTheDocument();
  });

  it('fails safely on a status this build cannot interpret', async () => {
    await uploadThenAccept('QUARANTINED');

    expect(await screen.findByText('Chưa xác định · Ảnh PNG')).toBeInTheDocument();
    expect(screen.queryByText(/QUARANTINED/)).not.toBeInTheDocument();
    expect(screen.queryByText(ASSET_COPY.accepted.description)).not.toBeInTheDocument();
  });
});

describe('cancellation and retry', () => {
  it('keeps a cancelled outcome honest and refreshes the list', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);
    await screen.findByRole('progressbar');

    clickButton(ASSET_COPY.progress.cancel);

    expect(await screen.findByText(ASSET_COPY.cancelled.title)).toBeInTheDocument();
    expect(screen.getByText(ASSET_COPY.cancelled.description)).toBeInTheDocument();
    // It never claims the server stored nothing.
    expect(screen.queryByText(/không có gì được lưu|chưa lưu bất kỳ/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(listMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('retries an ambiguous attempt under the very same idempotency key', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);
    await screen.findByRole('progressbar');
    clickButton(ASSET_COPY.progress.cancel);
    await screen.findByText(ASSET_COPY.cancelled.title);

    clickButton(ASSET_COPY.cancelled.retry);

    await waitFor(() => {
      expect(attempts).toHaveLength(2);
    });
    expect(idempotencyKeyOf(attempts[1] as ApiRequestOptions)).toBe(
      idempotencyKeyOf(attempts[0] as ApiRequestOptions),
    );
    expect(idempotencyKeyOf(attempts[0] as ApiRequestOptions)).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it('mints a new key only when the operator stages a different file', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);
    await screen.findByRole('progressbar');
    clickButton(ASSET_COPY.progress.cancel);
    await screen.findByText(ASSET_COPY.cancelled.title);

    selectFile(makeFile('khac.jpg', 'image/jpeg', 900_000));
    clickButton(ASSET_COPY.upload.submit);

    await waitFor(() => {
      expect(attempts).toHaveLength(2);
    });
    expect(idempotencyKeyOf(attempts[1] as ApiRequestOptions)).not.toBe(
      idempotencyKeyOf(attempts[0] as ApiRequestOptions),
    );
  });

  it('never renders, and never offers to copy, the idempotency key', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);
    await screen.findByRole('progressbar');

    const key = idempotencyKeyOf(attempts[0] as ApiRequestOptions);
    expect(document.body.textContent).not.toContain(key);
    expect(document.body.textContent).not.toMatch(/idempotency/i);
  });

  it('translates a rejected media type into guidance without a retry action', async () => {
    renderWithProviders(<AssetLibraryScreen />);
    await screen.findByText(ASSET_COPY.list.emptyTitle);
    selectFile(PNG_FILE);
    clickButton(ASSET_COPY.upload.submit);
    await screen.findByRole('progressbar');

    settle?.reject(
      makeApiClientError({ status: 415, code: 'ASSET_UPLOAD_MEDIA_UNSUPPORTED', message: 'raw' }),
    );

    expect(await screen.findByText(ASSET_COPY.errors.mediaUnsupported)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ASSET_COPY.uploadError.retry }),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('raw');
  });
});

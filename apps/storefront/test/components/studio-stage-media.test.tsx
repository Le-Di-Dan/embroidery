/**
 * The stage's two media concerns (`APP3-S02`): the Product Side background it
 * *is* allowed to fetch, and the Session image bytes it is *not*.
 *
 * The background tests exist because a `no-store` blob is easy to render and
 * hard to let go of: an object URL that survives its bytes, a cache entry that
 * outlives the grant it was served under, or a previous Side's garment left on
 * screen under a new Side's design are all invisible until they are wrong.
 *
 * The placeholder tests exist because "we cannot show this yet" is a claim that
 * decays into "we quietly showed it another way". Nothing on this stage may
 * reach a Design Session's image bytes: `APP3-B06C` is not built, and
 * `APP3-B05A` serves published *Template* assets under an authority a cloned
 * Session does not inherit.
 */
import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { STUDIO_STAGE_COPY } from '../../src/features/design-studio/model/studio-stage-copy';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { apiFailure, PRODUCT_SLUG } from '../support/studio-fixture';
import {
  imageElement,
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  shapeElement,
  textElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicProductMediaGet: jest.fn(),
}));

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

const createdUrls: Blob[] = [];
const revokedUrls: string[] = [];

beforeAll(() => {
  URL.createObjectURL = jest.fn((blob: Blob) => {
    createdUrls.push(blob);
    return `blob:studio/${String(createdUrls.length)}`;
  });
  URL.revokeObjectURL = jest.fn((url: string) => {
    revokedUrls.push(url);
  });
});

beforeEach(() => {
  backgroundMock.mockReset();
  createdUrls.length = 0;
  revokedUrls.length = 0;
  useStudioInteractionStore.setState({ selectedElementId: null });
});

function renderStage(
  document = makeStageDocument([shapeElement('a')]),
  scope: ReturnType<typeof makeScope> | null = makeScope(),
) {
  return renderWithProviders(
    <StudioStageScreen
      isResuming={false}
      onResume={jest.fn()}
      scope={scope}
      snapshot={makeStageSnapshot(document)}
    />,
  );
}

describe('the Product Side background (APP3-B02)', () => {
  it('addresses the Session scope by Product slug and Side code', async () => {
    backgroundMock.mockResolvedValue(new Blob(['bytes']));
    renderStage(makeStageDocument([shapeElement('a')]), makeScope({ sideCode: 'mat-sau' }));

    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(1);
    });
    expect(backgroundMock.mock.calls[0]?.[0]).toBe(PRODUCT_SLUG);
    expect(backgroundMock.mock.calls[0]?.[1]).toBe('mat-sau');
  });

  it('renders the bytes as an object URL inside the document coordinate system', async () => {
    backgroundMock.mockResolvedValue(new Blob(['bytes']));
    renderStage();

    const image = await screen.findByTestId('studio-stage-background');
    expect(image.getAttribute('href')).toBe('blob:studio/1');
    expect(image.getAttribute('width')).toBe('1000');
    expect(image.getAttribute('height')).toBe('800');
    expect(image.getAttribute('x')).toBe('0');
    expect(image.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('never names a storage address anywhere in the rendered stage', async () => {
    backgroundMock.mockResolvedValue(new Blob(['bytes']));
    const { container } = renderStage();

    await screen.findByTestId('studio-stage-background');
    const markup = container.innerHTML;
    for (const leak of ['amazonaws', 'minio', 's3://', 'X-Amz-', 'storageKey']) {
      expect(markup).not.toContain(leak);
    }
    expect(markup).toContain('blob:studio/1');
  });

  it('revokes the object URL when the stage goes away', async () => {
    backgroundMock.mockResolvedValue(new Blob(['bytes']));
    const { unmount } = renderStage();

    await screen.findByTestId('studio-stage-background');
    expect(revokedUrls).toHaveLength(0);

    unmount();

    expect(revokedUrls).toEqual(['blob:studio/1']);
  });

  it('shows no background at all when the Session snapshot carried no scope', async () => {
    renderStage(makeStageDocument([shapeElement('a')]), null);

    await waitFor(() => {
      expect(screen.getByTestId('studio-stage-background-notice')).toHaveTextContent(
        STUDIO_STAGE_COPY.backgroundUnavailable,
      );
    });
    expect(backgroundMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('studio-stage-background')).not.toBeInTheDocument();
  });

  it('does not hold the bytes after nothing renders them', async () => {
    backgroundMock.mockResolvedValue(new Blob(['bytes']));
    const first = renderStage();
    await screen.findByTestId('studio-stage-background');
    first.unmount();

    // `gcTime: 0` drops the entry the moment it is unobserved, so a second
    // mount re-authorizes against the server rather than trusting a snapshot of
    // a `no-store` response.
    const second = renderStage();
    await screen.findByTestId('studio-stage-background');
    expect(backgroundMock).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  it('offers a retry for a transient failure and none for a withdrawn background', async () => {
    backgroundMock.mockRejectedValueOnce(apiFailure(503));
    const { unmount } = renderStage();

    await waitFor(() => {
      expect(screen.getByTestId('studio-stage-background-notice')).toHaveTextContent(
        STUDIO_STAGE_COPY.backgroundFailed,
      );
    });
    expect(screen.getByTestId('studio-stage-background-retry')).toBeInTheDocument();
    unmount();

    backgroundMock.mockReset();
    backgroundMock.mockRejectedValue(apiFailure(404));
    renderStage();

    await waitFor(() => {
      expect(screen.getByTestId('studio-stage-background-notice')).toHaveTextContent(
        STUDIO_STAGE_COPY.backgroundUnavailable,
      );
    });
    expect(screen.queryByTestId('studio-stage-background-retry')).not.toBeInTheDocument();
  });

  it('keeps the design fully visible and selectable without a background', async () => {
    const user = createUser();
    backgroundMock.mockRejectedValue(apiFailure(404));
    renderStage(makeStageDocument([shapeElement('a')]));

    await user.click(screen.getByTestId('studio-element-a'));

    expect(screen.getByTestId('studio-stage-selection')).toBeInTheDocument();
  });
});

describe('image elements whose bytes S02 cannot deliver', () => {
  beforeEach(() => {
    backgroundMock.mockRejectedValue(apiFailure(404));
  });

  it('draws a placeholder at the image element real geometry', () => {
    renderStage(
      makeStageDocument([
        imageElement('img', {
          transform: {
            x: 200,
            y: 150,
            width: 320,
            height: 180,
            rotationDeg: 0,
            scaleX: 1,
            scaleY: 1,
          },
        }),
      ]),
    );

    const frame = screen
      .getByTestId('studio-image-placeholder')
      .querySelector('.studio-stage__image-placeholder');
    expect(frame?.getAttribute('width')).toBe('320');
    expect(frame?.getAttribute('height')).toBe('180');
    // Placed by the engine matrix, drawn at its own local origin.
    expect(screen.getByTestId('studio-element-img')).toHaveAttribute(
      'transform',
      'matrix(1 0 0 1 200 150)',
    );
  });

  it('says what it is instead of pretending to be the picture', () => {
    renderStage(makeStageDocument([imageElement('img')]));

    expect(screen.getByTestId('studio-image-placeholder')).toHaveTextContent(
      STUDIO_STAGE_COPY.imagePlaceholder,
    );
  });

  it('never puts the asset or derivative id on screen', () => {
    const { container } = renderStage(makeStageDocument([imageElement('img')]));

    expect(container.textContent).not.toContain('asset-img');
    expect(container.textContent).not.toContain('derivative-img');
    expect(container.innerHTML).not.toContain('derivative-img');
  });

  it('keeps the image element selectable like any other element', async () => {
    const user = createUser();
    renderStage(makeStageDocument([imageElement('img')]));

    await user.click(screen.getByTestId('studio-element-img'));

    expect(screen.getByTestId('studio-element-img')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('studio-stage-selection')).toBeInTheDocument();
  });

  it('reaches for no asset route at all — not B05A, not a generic one', async () => {
    const client = jest.requireMock<Record<string, jest.Mock>>('@embroidery/api-client');
    renderStage(makeStageDocument([imageElement('img')]));

    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalled();
    });
    expect(client.publicDesignTemplateAssetGet).not.toHaveBeenCalled();
    expect(client.publicProductMediaGet).not.toHaveBeenCalled();
  });

  it('draws text and shape siblings normally beside it', () => {
    renderStage(makeStageDocument([textElement('t'), imageElement('img'), shapeElement('s')]));

    expect(screen.getByTestId('studio-element-t')).toBeInTheDocument();
    expect(screen.getByTestId('studio-element-s')).toBeInTheDocument();
    expect(screen.getByTestId('studio-image-placeholder')).toBeInTheDocument();
  });
});

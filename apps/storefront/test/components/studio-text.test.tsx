/**
 * The text inspector, driven as a customer drives it (`APP3-S05`).
 *
 * The model test proves the rules; this proves the form asks them, that the
 * stage reflects the answer, and that the two never disagree. It also carries
 * the two things only a rendered tree can show: that a composition in progress
 * never reaches the document, and that editing one element's text does not
 * re-render the ninety-nine it did not touch.
 *
 * The render count is taken through `elementLabel`, the same production call
 * `APP3-S03-C1` counts renders with — no telemetry ships, and the seam cannot
 * drift away from what it measures.
 */
import { act } from 'react';

import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { STUDIO_TEXT_COPY } from '../../src/features/design-studio/model/studio-text-copy';
import type * as StageLabelModule from '../../src/features/design-studio/model/studio-stage-label';
import * as stageLabel from '../../src/features/design-studio/model/studio-stage-label';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  setViewportWidth,
  shapeElement,
  textElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductPlacementGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
}));

jest.mock('../../src/features/design-studio/model/studio-stage-label', () => {
  const actual = jest.requireActual<typeof StageLabelModule>(
    '../../src/features/design-studio/model/studio-stage-label',
  );
  const calls: string[] = [];
  return {
    ...actual,
    __calls: calls,
    elementLabel: (element: Parameters<typeof actual.elementLabel>[0]) => {
      calls.push(element.id);
      return actual.elementLabel(element);
    },
  };
});

const labelCalls = (stageLabel as unknown as { __calls: string[] }).__calls;
const rendersOf = (id: string) => labelCalls.filter((called) => called === id).length;

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

/** Inside the fixture safe area (100,120 → 400,320). */
const INSIDE = { x: 150, y: 160, width: 100, height: 60, rotationDeg: 0, scaleX: 1, scaleY: 1 };

const scene = makeStageDocument([
  textElement('t', { transform: INSIDE }),
  shapeElement('s', { transform: { ...INSIDE, x: 260 } }),
]);

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
});

beforeEach(() => {
  // The accepted desktop composition, stated rather than inherited. jsdom's own
  // default width sits in the tablet band, where `APP3-S05-C1` puts the
  // inspector in a drawer — this suite would then have been quietly testing a
  // different composition from the one it describes.
  setViewportWidth(1440);
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  useStudioViewportStore.getState().resetViewport();
  labelCalls.length = 0;
});

function renderStage(document = scene) {
  return renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onResume={jest.fn()}
      scope={makeScope()}
      snapshot={makeStageSnapshot(document)}
      templateName={null}
    />,
  );
}

function select(id: string) {
  act(() => {
    useStudioInteractionStore.getState().selectElement(id);
  });
}

const textBox = () => screen.getByTestId('studio-text-value');
const storedText = () =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === 't') as
    { text: string } | undefined;

describe('editability follows the selection (APP3-S05 §10)', () => {
  it('is neutral, and names no capability, when nothing is selected', () => {
    renderStage();
    expect(screen.getByTestId('studio-text-unavailable')).toHaveTextContent('Chọn một đối tượng');
    expect(screen.queryByTestId('studio-text-value')).not.toBeInTheDocument();
  });

  it('enables the inspector for a selected, visible, unlocked text element', () => {
    renderStage();
    select('t');
    expect(textBox()).toHaveValue('Xin chào');
  });

  it('says so, rather than going blank, when the selection is not text', () => {
    renderStage();
    select('s');
    expect(screen.getByTestId('studio-text-unavailable')).toHaveTextContent('không phải là chữ');
    expect(screen.queryByTestId('studio-text-value')).not.toBeInTheDocument();
  });

  it('refuses to edit a locked text element', () => {
    renderStage(makeStageDocument([textElement('t', { transform: INSIDE, locked: true })]));
    select('t');
    expect(screen.getByTestId('studio-text-unavailable')).toHaveTextContent('đang bị khoá');
    expect(screen.queryByTestId('studio-text-value')).not.toBeInTheDocument();
  });

  it('refuses to edit a hidden text element', () => {
    renderStage(makeStageDocument([textElement('t', { transform: INSIDE, visible: false })]));
    select('t');
    expect(screen.getByTestId('studio-text-unavailable')).toHaveTextContent('đang được ẩn');
  });
});

describe('editing text (APP3-S05 §12, §21)', () => {
  it('writes the completed value to the working document and to the SVG', () => {
    renderStage();
    select('t');

    fireEvent.change(textBox(), { target: { value: 'Thêu tên' } });
    fireEvent.blur(textBox());

    expect(storedText()?.text).toBe('Thêu tên');
    expect(screen.getByTestId('studio-element-t')).toHaveTextContent('Thêu tên');
  });

  it('keeps the selection, the id and the transform across the edit', () => {
    renderStage();
    select('t');
    fireEvent.change(textBox(), { target: { value: 'Mới' } });
    fireEvent.blur(textBox());

    expect(useStudioInteractionStore.getState().selectedElementId).toBe('t');
    const element = useStudioDocumentStore
      .getState()
      .document?.elements.find((candidate) => candidate.id === 't');
    expect(element?.id).toBe('t');
    expect(element?.transform).toEqual(INSIDE);
  });

  it('applies a supported property and shows the exact P01 value on the SVG', () => {
    renderStage();
    select('t');

    fireEvent.change(screen.getByTestId('studio-text-size'), { target: { value: '48' } });

    const painted = screen.getByTestId('studio-element-t').querySelector('text');
    expect(painted?.getAttribute('font-size')).toBe('48');
    expect(painted?.getAttribute('font-family')).toBe('Inter');
  });

  it('changes alignment through the exact P01 enum', () => {
    renderStage();
    select('t');
    fireEvent.change(screen.getByTestId('studio-text-align'), { target: { value: 'center' } });

    const painted = screen.getByTestId('studio-element-t').querySelector('text');
    expect(painted?.getAttribute('text-anchor')).toBe('middle');
  });

  it('leaves an unrelated element untouched', () => {
    renderStage();
    select('t');
    const before = scene.elements[1];
    fireEvent.change(textBox(), { target: { value: 'Khác' } });
    fireEvent.blur(textBox());

    expect(useStudioDocumentStore.getState().document?.elements[1]).toEqual(before);
  });
});

describe('a refused candidate never enters the document (APP3-S05 §13, §16)', () => {
  it('states the refusal and keeps the last valid document', () => {
    renderStage();
    select('t');

    fireEvent.change(textBox(), { target: { value: 'a'.repeat(501) } });
    fireEvent.blur(textBox());

    expect(screen.getByTestId('studio-text-refusal')).toHaveTextContent('vượt quá 500 ký tự');
    // The document still holds the last value that was legal.
    expect(storedText()?.text).toBe('Xin chào');
    // And the field keeps what the customer typed, so they can correct it.
    expect(textBox()).toHaveValue('a'.repeat(501));
  });

  it('announces the refusal rather than showing it in colour alone', () => {
    renderStage();
    select('t');
    fireEvent.change(textBox(), { target: { value: 'a'.repeat(501) } });
    fireEvent.blur(textBox());

    const refusal = screen.getByTestId('studio-text-refusal');
    expect(refusal).toHaveAttribute('role', 'alert');
    expect(textBox()).toHaveAttribute('aria-describedby', expect.stringContaining(refusal.id));
  });

  it('refuses a non-NFC completed candidate without rewriting it', () => {
    renderStage();
    select('t');

    fireEvent.change(textBox(), { target: { value: 'Việt'.normalize('NFD') } });
    fireEvent.blur(textBox());

    expect(screen.getByTestId('studio-text-refusal')).toBeInTheDocument();
    expect(storedText()?.text).toBe('Xin chào');
  });
});

describe('Vietnamese composition (APP3-S05 §13)', () => {
  it('does not commit an intermediate composition frame', () => {
    renderStage();
    select('t');

    fireEvent.compositionStart(textBox());
    fireEvent.change(textBox(), { target: { value: 'Vieet' } });
    fireEvent.change(textBox(), { target: { value: 'Viet' } });

    // Mid-composition the field shows what the IME is building and the document
    // still holds the last completed value.
    expect(textBox()).toHaveValue('Viet');
    expect(storedText()?.text).toBe('Xin chào');
  });

  it('commits the completed composition', () => {
    renderStage();
    select('t');

    fireEvent.compositionStart(textBox());
    fireEvent.change(textBox(), { target: { value: 'Việt' } });
    fireEvent.compositionEnd(textBox(), { target: { value: 'Việt' } });

    expect(storedText()?.text).toBe('Việt');
  });
});

describe('a draft can never cross a selection (APP3-S05 §20)', () => {
  it('drops a refused draft when the selection changes, and never commits it elsewhere', () => {
    // A refused candidate is the only kind of draft that survives its own
    // keystroke, so it is the only one that can still be pending when the
    // customer clicks a different element — and the one that must not land on
    // it. A blur after the switch would be the moment it did.
    renderStage(
      makeStageDocument([
        textElement('t', { transform: INSIDE }),
        textElement('u', { transform: { ...INSIDE, x: 260 }, text: 'Khác' }),
      ]),
    );
    select('t');
    fireEvent.change(textBox(), { target: { value: 'a'.repeat(501) } });
    expect(screen.getByTestId('studio-text-refusal')).toBeInTheDocument();

    select('u');

    // The second element's own text, not the first one's refused draft — and
    // the first element's refusal does not travel with it either.
    expect(textBox()).toHaveValue('Khác');
    expect(screen.queryByTestId('studio-text-refusal')).not.toBeInTheDocument();

    fireEvent.blur(textBox());
    const document = useStudioDocumentStore.getState().document;
    expect(document?.elements.find((element) => element.id === 't')).toMatchObject({
      text: 'Xin chào',
    });
    expect(document?.elements.find((element) => element.id === 'u')).toMatchObject({
      text: 'Khác',
    });
  });
});

describe('the S03-C1 render architecture survives a text edit (APP3-S05 §18)', () => {
  it('re-renders the edited element and not its unchanged sibling', () => {
    renderStage(
      makeStageDocument([
        textElement('t', { transform: INSIDE }),
        shapeElement('b', { transform: { ...INSIDE, x: 260 } }),
        shapeElement('c', { transform: { ...INSIDE, x: 300 } }),
      ]),
    );
    select('t');
    labelCalls.length = 0;

    fireEvent.change(textBox(), { target: { value: 'Đổi chữ' } });
    fireEvent.blur(textBox());

    expect(rendersOf('b')).toBe(0);
    expect(rendersOf('c')).toBe(0);
    expect(rendersOf('t')).toBeGreaterThan(0);
  });

  it('keeps exactly one SVG scene', () => {
    const { container } = renderStage();
    select('t');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('S05 pulls nothing forward (APP3-S05 §19)', () => {
  it('adds no save, upload or watermark control', () => {
    renderStage();
    select('t');

    for (const pulled of [/đã lưu/i, /đang lưu/i, /tải ảnh/i]) {
      expect(screen.queryByText(pulled)).not.toBeInTheDocument();
    }
  });

  /*
   * The history ban became a history *boundary* at `APP3-S08`.
   *
   * "No undo control anywhere" was right while there was no history capability,
   * and deleting it now would let the text inspector grow one of its own. So the
   * rule is narrower rather than gone: there is exactly one undo surface, it is
   * S08's, and the text inspector is not it.
   */
  it('grows no history surface of its own', () => {
    renderStage();
    select('t');

    // One rail and one list, both `APP3-S08`'s, and the text inspector is
    // neither. The anchor moved with the controls at `APP3-S08-C1`; the rule
    // did not weaken.
    expect(screen.getAllByTestId('studio-history-rail')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-history-list')).toHaveLength(1);
    const inspector = screen.getByTestId('studio-text-value').closest('section');
    expect(inspector?.querySelector('[data-testid="studio-history-rail"]')).toBeFalsy();
    expect(inspector?.querySelector('[data-testid="studio-history-list"]')).toBeFalsy();
  });

  /*
   * The layer ban became a layer *boundary* at `APP3-S04`.
   *
   * "No layer control anywhere" was right while there was no layer capability,
   * and deleting it now would let the text inspector grow one of its own. So the
   * rule is narrower rather than gone: there is exactly one layer surface, it is
   * S04's, and the text inspector is not it.
   */
  it('grows no layer surface of its own', () => {
    renderStage();
    select('t');

    expect(screen.getAllByTestId('studio-layer-list')).toHaveLength(1);
    expect(
      screen
        .getByRole('region', { name: STUDIO_TEXT_COPY.panelLabel })
        .querySelector('[data-testid="studio-layer-list"]'),
    ).toBeNull();
  });

  it('calls no API for a text edit', () => {
    const client: Record<string, jest.Mock> = jest.requireMock('@embroidery/api-client');
    renderStage();
    select('t');
    fireEvent.change(textBox(), { target: { value: 'Không gọi API' } });
    fireEvent.blur(textBox());

    expect(client.publicDesignSessionAutosave).not.toHaveBeenCalled();
    expect(client.publicDesignSessionCreate).not.toHaveBeenCalled();
    expect(client.publicDesignSessionResume).not.toHaveBeenCalled();
  });
});

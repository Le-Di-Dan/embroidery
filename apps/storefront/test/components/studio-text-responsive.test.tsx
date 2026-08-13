/**
 * Where the text inspector goes, and which face it asked the browser about
 * (`APP3-S05-C1`).
 *
 * The two things human review sent `APP3-S05` back for. Both leave a working
 * editor behind, which is why they need a rendered tree rather than a source
 * rule:
 *
 * - **Composition.** `618:140` draws a right drawer over the stage at 1024 and
 *   no editing surface at all on a phone — that is `APP3-S11`'s. A panel stacked
 *   under the stage is a different composition; a CSS-hidden phone inspector is
 *   still focusable and still submittable.
 * - **Font readiness.** A family probe answers `ready` as soon as any Inter face
 *   arrives, so a missing italic binary reads as success and the browser
 *   synthesises a slant nobody audited. The probe has to name the exact triple.
 *
 * `document.fonts` does not exist in jsdom, so the font half installs a
 * controllable one: what the capability *asks*, and what it does with each
 * answer.
 */
import { act } from 'react';

import { publicProductSideBackgroundGet } from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
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

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

/** The three viewports the accepted design draws, named rather than guessed. */
const DESKTOP = 1440;
const TABLET = 1024;
const MOBILE = 390;

const INSIDE = { x: 150, y: 160, width: 100, height: 60, rotationDeg: 0, scaleX: 1, scaleY: 1 };

/** Every face the fake browser has. Anything else fails to load. */
let availableFaces: string[] = [];
let load: jest.Mock;
/** Requests parked until a test resolves them, for the race cases. */
let deferred: { shorthand: string; settle: (available: boolean) => void }[] = [];

function installFontSet(mode: 'immediate' | 'deferred' = 'immediate') {
  load = jest.fn((shorthand: string) => {
    if (mode === 'deferred') {
      return new Promise((resolve, reject) => {
        deferred.push({
          shorthand,
          settle: (available) => {
            if (available) resolve([{ family: 'Inter' }]);
            else reject(new Error('blocked'));
          },
        });
      });
    }
    return availableFaces.includes(shorthand)
      ? Promise.resolve([{ family: 'Inter' }])
      : Promise.reject(new Error('blocked'));
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load },
  });
}

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/background');
  URL.revokeObjectURL = jest.fn();
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => true);
});

beforeEach(() => {
  backgroundMock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  useStudioViewportStore.getState().resetViewport();
  availableFaces = ['normal 400 16px "Inter"'];
  deferred = [];
  // No font-loading API by default. The composition cases are about where the
  // inspector goes, and a browser with nothing to ask answers synchronously —
  // so those cases stay free of pending promises they would otherwise have to
  // flush for no reason. The font cases install one explicitly.
  Reflect.deleteProperty(document, 'fonts');
});

const scene = makeStageDocument([
  textElement('t', { transform: INSIDE }),
  shapeElement('s', { transform: { ...INSIDE, x: 260 } }),
]);

function renderStage(width: number, document = scene) {
  setViewportWidth(width);
  return renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onExpired={jest.fn()}
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

/** Lets every already-resolved font promise deliver its answer. */
async function settleFonts() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const storedElement = (id: string) =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === id) as
    { fontStyle: string; fontWeight: number } | undefined;

describe('1440 keeps the accepted desktop composition (APP3-S05-C1 §3)', () => {
  it('shows the inspector in flow, with no drawer and no trigger', () => {
    renderStage(DESKTOP);
    select('t');

    expect(screen.getByTestId('studio-text-value')).toBeVisible();
    expect(screen.queryByTestId('studio-text-drawer')).not.toBeInTheDocument();
    // A rule about the **trigger** since `APP3-S10`: "no topbar outside 1024"
    // was right while the toggle was its only reason to exist, and the save chip
    // now shares that one region at every tier. The inspector is in flow here,
    // so no trigger may open a second copy of it.
    expect(screen.getAllByTestId('studio-stage-topbar')).toHaveLength(1);
    expect(screen.queryByTestId('studio-text-drawer-trigger')).not.toBeInTheDocument();
  });
});

describe('1024 is the accepted right drawer (APP3-S05-C1 §3, FIG-STUDIO-EDITING-TABLET-1024)', () => {
  it('does not put the inspector under the stage: the panel is closed until asked for', () => {
    renderStage(TABLET);
    select('t');

    expect(screen.getByTestId('studio-text-drawer')).not.toBeVisible();
    expect(screen.getByTestId('studio-text-value')).not.toBeVisible();
  });

  it('is toggled by a persistent control that states what it controls', () => {
    renderStage(TABLET);
    select('t');
    const trigger = screen.getByTestId('studio-text-drawer-trigger');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', screen.getByTestId('studio-text-drawer').id);

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('studio-text-drawer')).toBeVisible();
    expect(screen.getByTestId('studio-text-value')).toBeVisible();
  });

  it('leaves the stage geometry byte-identical across the toggle', () => {
    // The whole point of an out-of-flow drawer. If opening it re-laid-out the
    // stage, the SVG's own coordinate system would move — and every millimetre
    // the transform overlay derives from it with it.
    const { container } = renderStage(TABLET);
    select('t');
    const svg = container.querySelector('svg');
    const before = svg?.outerHTML;

    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));

    expect(container.querySelector('svg')?.outerHTML).toBe(before);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('edits through the drawer into the one working document', () => {
    renderStage(TABLET);
    select('t');
    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));

    fireEvent.change(screen.getByTestId('studio-text-value'), { target: { value: 'Trong ngăn' } });
    fireEvent.blur(screen.getByTestId('studio-text-value'));

    expect(screen.getByTestId('studio-element-t')).toHaveTextContent('Trong ngăn');
  });

  it('returns focus to the trigger when it closes, and keeps the edit', () => {
    renderStage(TABLET);
    select('t');
    const trigger = screen.getByTestId('studio-text-drawer-trigger');
    fireEvent.click(trigger);
    fireEvent.change(screen.getByTestId('studio-text-value'), { target: { value: 'Giữ lại' } });

    fireEvent.click(screen.getByTestId('studio-text-drawer-close'));

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(screen.getByTestId('studio-text-value')).toHaveValue('Giữ lại');
  });

  it('closes on Escape from inside the panel', () => {
    renderStage(TABLET);
    select('t');
    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));

    fireEvent.keyDown(screen.getByTestId('studio-text-value'), { key: 'Escape' });

    expect(screen.getByTestId('studio-text-drawer')).not.toBeVisible();
    expect(screen.getByTestId('studio-text-drawer-trigger')).toHaveFocus();
  });
});

describe('the tablet trigger lives in the Studio topbar (APP3-S05-MI01 §1)', () => {
  it('renders a topbar above the stage, and puts the trigger inside it', () => {
    const { container } = renderStage(TABLET);
    select('t');

    const topbar = screen.getByTestId('studio-stage-topbar');
    const trigger = screen.getByTestId('studio-text-drawer-trigger');
    expect(topbar).toContainElement(trigger);

    // Above the stage in the document, not merely painted above it. `order`
    // would satisfy the eye and leave the keyboard reaching the control last.
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(
      topbar.compareDocumentPosition(svg as SVGElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('leaves the APP3-S07 control strip below the stage exactly as it was', () => {
    const { container } = renderStage(TABLET);
    select('t');

    const strip = screen.getByTestId('studio-stage-controls');
    expect(strip).not.toContainElement(screen.getByTestId('studio-text-drawer-trigger'));
    // And the strip is still below the stage, still carrying S07's own controls.
    const svg = container.querySelector('svg') as SVGElement;
    expect(strip.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    for (const control of ['studio-zoom-in', 'studio-zoom-out', 'studio-zoom-fit']) {
      expect(strip).toContainElement(screen.getByTestId(control));
    }
  });

  it('controls the same right drawer from the topbar, and returns focus there', () => {
    renderStage(TABLET);
    select('t');
    const trigger = screen.getByTestId('studio-text-drawer-trigger');

    expect(trigger).toHaveAttribute('aria-controls', screen.getByTestId('studio-text-drawer').id);
    fireEvent.click(trigger);
    expect(screen.getByTestId('studio-text-drawer')).toBeVisible();

    fireEvent.keyDown(screen.getByTestId('studio-text-value'), { key: 'Escape' });
    expect(screen.getByTestId('studio-text-drawer')).not.toBeVisible();
    expect(trigger).toHaveFocus();
    // The trigger focus landed on is the topbar one, not a second control.
    expect(screen.getByTestId('studio-stage-topbar')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('renders no trigger and no drawer on a phone', () => {
    renderStage(MOBILE);
    select('t');
    expect(screen.queryByTestId('studio-text-drawer-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio-text-drawer')).not.toBeInTheDocument();
  });
});

describe('390 exposes no text editing surface at all (APP3-S05-C1 §5)', () => {
  it('renders no field, no font control and no drawer', () => {
    renderStage(MOBILE);
    select('t');

    for (const control of [
      'studio-text-value',
      'studio-text-font',
      'studio-text-style',
      'studio-text-weight',
      'studio-text-size',
      'studio-text-align',
      'studio-text-drawer',
      'studio-text-drawer-trigger',
    ]) {
      expect(screen.queryByTestId(control)).not.toBeInTheDocument();
    }
  });

  /*
   * The 390 boundary moved with the world (`APP3-S11`).
   *
   * The notice is gone rather than reworded: it said this tier could not edit
   * text, and `610:409` now does. What the rule above still guarantees is that
   * this **panel** renders no field at 390 — the editing surface is the sheet,
   * and what it does when opened is ruled in the S11 suite beside it.
   */
  it('renders no mobile notice, because the capability now exists', () => {
    renderStage(MOBILE);
    select('t');

    expect(screen.queryByTestId('studio-text-mobile-notice')).not.toBeInTheDocument();
  });
});

describe('readiness is asked per exact variant (APP3-S05-C1 §6, §7, §9)', () => {
  beforeEach(() => {
    installFontSet();
  });

  it('asks for the style and the weight the document actually holds', async () => {
    renderStage(DESKTOP);
    select('t');
    await settleFonts();

    expect(load).toHaveBeenCalledWith('normal 400 16px "Inter"');
  });

  it('asks for the exact variant a Session opens on, not the default one', async () => {
    renderStage(
      DESKTOP,
      makeStageDocument([
        textElement('t', { transform: INSIDE, fontStyle: 'italic', fontWeight: 700 }),
      ]),
    );
    select('t');
    await settleFonts();

    expect(load).toHaveBeenCalledWith('italic 700 16px "Inter"');
    expect(load).not.toHaveBeenCalledWith('normal 400 16px "Inter"');
  });

  it('never names a fallback family, which would make every probe succeed', async () => {
    renderStage(DESKTOP);
    select('t');
    await settleFonts();

    for (const [shorthand] of load.mock.calls as [string][]) {
      expect(shorthand).not.toMatch(/,|sans-serif|serif|system-ui/);
    }
  });

  it('reports the loaded upright as ready, and says nothing further', async () => {
    renderStage(DESKTOP);
    select('t');
    await settleFonts();

    expect(screen.queryByTestId('studio-text-font-unavailable')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio-text-font-loading')).not.toBeInTheDocument();
  });

  it('does not let a loaded upright speak for an unavailable italic', async () => {
    renderStage(
      DESKTOP,
      makeStageDocument([textElement('t', { transform: INSIDE, fontStyle: 'italic' })]),
    );
    select('t');
    await settleFonts();

    // The upright is in `availableFaces`; the italic is not.
    expect(screen.getByTestId('studio-text-font-unavailable')).toBeInTheDocument();
  });
});

describe('a variant becomes document truth only once it loads (APP3-S05-C1 §8)', () => {
  beforeEach(() => {
    installFontSet();
  });

  it('commits the exact P01 value when the requested face arrives', async () => {
    availableFaces = ['normal 400 16px "Inter"', 'italic 400 16px "Inter"'];
    renderStage(DESKTOP);
    select('t');
    await settleFonts();

    fireEvent.change(screen.getByTestId('studio-text-style'), { target: { value: 'italic' } });
    await settleFonts();

    expect(storedElement('t')?.fontStyle).toBe('italic');
    expect(screen.getByTestId('studio-element-t').querySelector('text')).toHaveAttribute(
      'font-style',
      'italic',
    );
  });

  it('keeps the previous value while the request is in flight', async () => {
    installFontSet('deferred');
    renderStage(DESKTOP);
    select('t');

    fireEvent.change(screen.getByTestId('studio-text-style'), { target: { value: 'italic' } });
    await settleFonts();

    // Nothing has resolved yet: the document is untouched and the panel says so.
    expect(storedElement('t')?.fontStyle).toBe('normal');
    expect(screen.getByTestId('studio-text-font-loading')).toBeInTheDocument();
  });

  it('keeps the previous value, and states the failure, when the face never arrives', async () => {
    renderStage(DESKTOP);
    select('t');
    await settleFonts();

    fireEvent.change(screen.getByTestId('studio-text-style'), { target: { value: 'italic' } });
    await settleFonts();

    expect(storedElement('t')?.fontStyle).toBe('normal');
    const refusal = screen.getByTestId('studio-text-refusal');
    expect(refusal).toHaveAttribute('role', 'alert');
    expect(refusal).toHaveTextContent('Chưa tải được kiểu chữ');
  });

  it('asks again for a newly chosen weight rather than reusing the 400 answer', async () => {
    availableFaces = ['normal 400 16px "Inter"', 'normal 700 16px "Inter"'];
    renderStage(DESKTOP);
    select('t');
    await settleFonts();

    fireEvent.change(screen.getByTestId('studio-text-weight'), { target: { value: '700' } });
    await settleFonts();

    expect(load).toHaveBeenCalledWith('normal 700 16px "Inter"');
    expect(storedElement('t')?.fontWeight).toBe(700);
  });

  it('leaves a size change alone: it asks the browser nothing', async () => {
    renderStage(DESKTOP);
    select('t');
    await settleFonts();
    load.mockClear();

    fireEvent.change(screen.getByTestId('studio-text-size'), { target: { value: '48' } });

    expect(load).not.toHaveBeenCalled();
  });
});

describe('a superseded variant answer changes nothing (APP3-S05-C1 §10)', () => {
  beforeEach(() => {
    installFontSet();
  });

  it('ignores a slow italic that resolves after the customer chose upright', async () => {
    installFontSet('deferred');
    renderStage(
      DESKTOP,
      makeStageDocument([textElement('t', { transform: INSIDE, fontStyle: 'italic' })]),
    );
    select('t');

    fireEvent.change(screen.getByTestId('studio-text-style'), { target: { value: 'normal' } });
    await settleFonts();

    const italic = deferred.find((request) => request.shorthand.startsWith('italic 400'));
    const upright = deferred.find((request) => request.shorthand.startsWith('normal 400'));
    act(() => {
      upright?.settle(true);
    });
    await settleFonts();
    act(() => {
      // The stale one, answering last and answering "yes".
      italic?.settle(true);
    });
    await settleFonts();

    expect(storedElement('t')?.fontStyle).toBe('normal');
  });

  it('cannot land a variant request on the element the customer moved to', async () => {
    installFontSet('deferred');
    renderStage(
      DESKTOP,
      makeStageDocument([
        textElement('t', { transform: INSIDE }),
        textElement('u', { transform: { ...INSIDE, x: 260 }, text: 'Khác' }),
      ]),
    );
    select('t');
    fireEvent.change(screen.getByTestId('studio-text-style'), { target: { value: 'italic' } });
    await settleFonts();

    select('u');
    act(() => {
      deferred.find((request) => request.shorthand.startsWith('italic 400'))?.settle(true);
    });
    await settleFonts();

    expect(storedElement('t')?.fontStyle).toBe('normal');
    expect(storedElement('u')?.fontStyle).toBe('normal');
  });
});

describe('the correction pulls nothing forward (APP3-S05-C1 §13, §14)', () => {
  it('calls no API for a composition change or a variant change', async () => {
    const client: Record<string, jest.Mock> = jest.requireMock('@embroidery/api-client');
    availableFaces = ['normal 400 16px "Inter"', 'italic 400 16px "Inter"'];
    renderStage(TABLET);
    select('t');
    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));
    fireEvent.change(screen.getByTestId('studio-text-style'), { target: { value: 'italic' } });
    await settleFonts();

    expect(client.publicDesignSessionAutosave).not.toHaveBeenCalled();
    expect(client.publicDesignSessionCreate).not.toHaveBeenCalled();
    expect(client.publicDesignSessionResume).not.toHaveBeenCalled();
  });

  // Scoped at `APP3-S10`, not dropped: the save state exists and is deliberately
  // *outside* the drawer, because a decision about losing unsaved work may not
  // sit behind a toggle.
  it('adds no upload or save control to the drawer', () => {
    renderStage(TABLET);
    select('t');
    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));
    const drawer = screen.getByTestId('studio-text-drawer');

    for (const pulled of ['đã lưu', 'đang lưu', 'tải ảnh']) {
      expect(drawer.innerHTML.toLowerCase()).not.toContain(pulled);
    }
    expect(drawer.querySelector('[data-testid="studio-save-chip"]')).toBeFalsy();
  });

  // Undo is *in* the drawer at 1024, for the same reason the layers are
  // (`APP3-D01-C1`: 1024 "cannot hold three regions"). The rule is that there is
  // exactly one of it inside the one drawer — not that it is absent, which
  // stopped being true at `APP3-S08`.
  it('puts the one history surface inside the same single drawer', () => {
    renderStage(TABLET);
    select('t');
    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));

    const drawer = screen.getByTestId('studio-text-drawer');
    // `APP3-S08-C1`: the history *detail* is the drawer section; the controls
    // moved to the persistent rail `618:140` keeps visible. One of each, and
    // neither is a second drawer.
    expect(screen.getAllByTestId('studio-history-list')).toHaveLength(1);
    expect(drawer.contains(screen.getByTestId('studio-history-list'))).toBe(true);
    expect(drawer.contains(screen.getByTestId('studio-history-rail'))).toBe(false);
    expect(screen.getAllByTestId('studio-text-drawer')).toHaveLength(1);
  });

  // The layers are *in* the drawer at 1024 and that is the accepted design
  // ("layers merge into that same drawer"). What must stay impossible is a
  // **second** drawer, so the rule counts panels rather than banning a word.
  it('keeps the layer panel inside the one accepted drawer', () => {
    renderStage(TABLET);
    select('t');

    // Closed, the drawer is `hidden`: the subtree stays in the DOM so
    // `aria-controls` resolves, but it is out of the accessibility tree and out
    // of the tab order — so no layer control is reachable before the one
    // trigger is used.
    expect(screen.getByTestId('studio-text-drawer')).toHaveAttribute('hidden');
    expect(screen.queryByRole('button', { name: /Chọn lớp/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('studio-text-drawer-trigger'));

    const drawer = screen.getByTestId('studio-text-drawer');
    expect(drawer.querySelectorAll('[data-testid="studio-layer-list"]')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-stage-topbar')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-text-drawer')).toHaveLength(1);
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationIssueButton } from './EvaluationIssueButton.tsx';

describe('one-click evaluation error sharing', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'clipboard');
    vi.restoreAllMocks();
  });

  async function mount(makeReport = () => 'Rapport de diagnostic') {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root?.render(<EvaluationIssueButton makeReport={makeReport} />); });
    return host.querySelector('button')!;
  }

  it('copies the prepared report on desktop and confirms only after clipboard success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const prepare = vi.fn().mockReturnValue('Diagnostic sans copie');
    const button = await mount(prepare);
    expect(prepare).not.toHaveBeenCalled();
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(prepare).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('Diagnostic sans copie');
    expect(host?.textContent).toContain('Rapport copié');
  });

  it('uses the native share sheet when available without copying unnecessarily', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const button = await mount();
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(share).toHaveBeenCalledWith({
      title: 'Compagnon Correcteur — diagnostic', text: 'Rapport de diagnostic',
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(host?.textContent).toContain('Partage lancé');
  });

  it('does not claim success on cancellation or clipboard denial', async () => {
    const abort = new Error('user cancelled'); abort.name = 'AbortError';
    Object.defineProperty(navigator, 'share', {
      configurable: true, value: vi.fn().mockRejectedValue(abort),
    });
    const button = await mount();
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(host?.textContent).toContain('Partage annulé');
    expect(host?.textContent).not.toContain('Rapport copié');
    Reflect.deleteProperty(navigator, 'share');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(host?.textContent).toContain('Partage impossible');
    expect(host?.textContent).not.toContain('Rapport copié');
  });
});

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { EvaluationJourneyPicker } from '../../src/ui/components/EvaluationJourneyPicker.tsx';

describe('EvaluationJourneyPicker', () => {
  it('offers distinct purposes, exposes the selection and prevents changing a running test', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onChange = vi.fn();
    await act(async () => root.render(createElement(EvaluationJourneyPicker, { value: 'custom', disabled: false, onChange })));
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(3);
    expect(container.querySelector('.evaluation-journey-label')?.textContent).toBe('Tests');
    expect(container.querySelector('h2')).toBeNull();
    expect(buttons.map((button) => button.textContent)).toEqual(['Schémas scientifiques', 'Biologie', 'Ma copie']);
    expect(buttons.every((button) => Boolean(button.title))).toBe(true);
    expect(buttons.every((button) => button.querySelector('span, small') === null)).toBe(true);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    await act(async () => buttons[0].click());
    expect(onChange).toHaveBeenCalledWith('diagrams');
    await act(async () => root.render(createElement(EvaluationJourneyPicker, { value: 'diagrams', disabled: true, onChange })));
    expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain('Schémas scientifiques');
    await act(async () => root.unmount());
  });
});

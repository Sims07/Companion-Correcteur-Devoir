import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = () => readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');

describe('correction launch feedback', () => {
  it('shows the progress state before waiting for background corrections to finish', () => {
    const source = appSource();
    const start = source.indexOf('async function gradeCopies(');
    const end = source.indexOf('async function startModelEvaluation()', start);
    const gradeCopies = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(gradeCopies.indexOf('setBusy(true)')).toBeLessThan(gradeCopies.indexOf('await backgroundService.pauseAndWait()'));
    expect(gradeCopies.indexOf("setTeacherStep('progress')")).toBeLessThan(gradeCopies.indexOf('await backgroundService.pauseAndWait()'));
    expect(gradeCopies.indexOf('setIsAnalyzing(true)')).toBeLessThan(gradeCopies.indexOf('await backgroundService.pauseAndWait()'));
  });

  it('disables repeated launches and communicates the current preparation phase', () => {
    const source = appSource();

    expect(source).toContain('aria-busy={busy}');
    expect(source).toContain('disabled={busy || !images.length');
    expect(source).toContain('Préparation de la correction…');
    expect(source).toContain('Lecture de la copie…');
    expect(source).toContain('Correction en cours…');
  });
});

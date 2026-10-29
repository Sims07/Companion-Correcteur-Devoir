import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(resolve(process.cwd(), 'src/ui/App.tsx'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/ui/correctionFlow.css'), 'utf8');

describe('Diagnostic IA — indicateurs d’évaluation des LLM', () => {
  it('exposes output validity, criterion coverage, declared confidence and teacher questions per run', () => {
    expect(appSource).toContain('Format exploitable');
    expect(appSource).toContain('Critères évalués');
    expect(appSource).toContain('Confiance moyenne déclarée');
    expect(appSource).toContain('Questions au professeur');
  });

  it('makes low-confidence criteria and missing evidence visible', () => {
    expect(appSource).toContain('Confiance déclarée :');
    expect(appSource).toContain('Aucune preuve textuelle fournie');
    expect(appSource).toContain('diagnostic-raw-warning');
  });

  it('keeps the diagnostic indicators responsive on narrow screens', () => {
    expect(styles).toContain('.diagnostic-run-metrics');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('@media (max-width: 380px)');
  });
});

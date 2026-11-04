import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');

describe('teacher review finalization wiring', () => {
  it('validates the full, teacher-adjusted rubric before archiving or marking a batch copy completed', () => {
    const finalization = source.slice(
      source.indexOf('async function finalizeReview('),
      source.indexOf('async function ', source.indexOf('async function finalizeReview(') + 10),
    );
    const validate = finalization.indexOf('validateReviewedCorrection(rubric, review)');
    const save = finalization.indexOf('await archiveService.saveCorrection(correction)');
    const markDone = finalization.indexOf('await backgroundService.markCompleted(');
    expect(validate).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(validate);
    expect(markDone).toBeGreaterThan(save);
    expect(finalization).toContain('setReviewMessage(reviewValidation.errors[0]');
  });

  it('permits only teacher-defined negative malus ranges in the editor', () => {
    expect(source).toContain('min={Math.min(0, criterion?.maxPoints ?? 0)}');
    expect(source).toContain('max={Math.max(0, criterion?.maxPoints ?? 0)}');
    expect(source).toContain('step="0.01"');
  });
});

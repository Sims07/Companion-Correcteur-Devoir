import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROMPT_REVISIONS, promptTrace } from './promptRegistry.ts';

describe('stable prompt metadata', () => {
  it('tracks distinct prompts for local decision, native System One and vision diagrams', () => {
    expect(promptTrace('decision.chat')).toEqual({ promptId: 'decision.chat', promptVersion: 1 });
    expect(promptTrace('decision.system-one')).toEqual({ promptId: 'decision.system-one', promptVersion: 1 });
    expect(promptTrace('diagram.scientific-analysis')).toEqual({ promptId: 'diagram.scientific-analysis', promptVersion: 4 });
    expect(promptTrace('vision.copy-transcription').promptId).not.toBe(promptTrace('grading.incremental').promptId);
  });

  it('always publishes a positive integer revision, without copies or user data in its registry', () => {
    expect(Object.keys(PROMPT_REVISIONS).length).toBeGreaterThan(12);
    expect(Object.values(PROMPT_REVISIONS).every((version) => Number.isInteger(version) && version > 0)).toBe(true);
    expect(JSON.stringify(PROMPT_REVISIONS)).not.toContain('base64');
  });

  it('shows the prompt identity in the technical observability workspace only', () => {
    const view = readFileSync(new URL('../../../ui/ObservabilityDashboard.tsx', import.meta.url), 'utf8');
    expect(view).toContain('Prompt utilisé');
    expect(view).toContain('span.promptId');
    expect(view).toContain('span.promptVersion');
  });
});

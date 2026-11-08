import { describe, expect, it } from 'vitest';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from './scientificDiagramProtocol.ts';
import { directDiagramAssignmentIssue, isLoopbackDiagramEndpoint } from './directDiagramAssignment.ts';

const valid = structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC);
const config = { correctionMethod: 'generative', analysisModel: 'qwen3.5:4b', endpoint: 'http://localhost:11434' };

describe('scientific diagram assignment security policy', () => {
  it('only treats loopback URLs as local', () => {
    expect(isLoopbackDiagramEndpoint('http://localhost:11434')).toBe(true);
    expect(isLoopbackDiagramEndpoint('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackDiagramEndpoint('https://ai.example')).toBe(false);
    expect(isLoopbackDiagramEndpoint('http://192.168.1.42:11434')).toBe(false);
    expect(isLoopbackDiagramEndpoint('invalid')).toBe(false);
  });

  it('rejects remote images without agreement to the exact current endpoint', () => {
    const remote = { ...config, endpoint: 'https://ai.example/v1/chat/completions' };
    expect(directDiagramAssignmentIssue(valid, remote, null)).toContain('Autorisez');
    expect(directDiagramAssignmentIssue(valid, remote, 'https://other.example')).toContain('Autorisez');
    expect(directDiagramAssignmentIssue(valid, remote, remote.endpoint)).toBeNull();
    expect(directDiagramAssignmentIssue(valid, { ...remote, endpoint: 'https://another.example/v1' }, remote.endpoint)).toContain('Autorisez');
    expect(directDiagramAssignmentIssue(valid, config, null)).toBeNull();
  });

  it('rejects malformed, mixed or non-generative rubrics without pretending an evaluation succeeded', () => {
    expect(directDiagramAssignmentIssue({ ...valid, criteria: [] }, config, null)).toBeTruthy();
    expect(directDiagramAssignmentIssue({
      ...valid, criteria: [{ ...valid.criteria[0]!, analysisMode: 'text' }],
    }, config, null)).toBeTruthy();
    expect(directDiagramAssignmentIssue(valid, { ...config, correctionMethod: 'decision' }, null)).toContain('générative');
    expect(directDiagramAssignmentIssue(valid, { ...config, analysisModel: '  ' }, null)).toContain('modèle');
  });
});

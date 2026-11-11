import { describe, expect, it } from 'vitest';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from './scientificDiagramProtocol.ts';
import { directDiagramAssignmentIssue } from './directDiagramAssignment.ts';

const valid = structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC);
const config = { correctionMethod: 'generative', analysisModel: 'qwen3.5:4b', endpoint: 'http://localhost:11434' };

describe('validation des devoirs de schéma scientifique', () => {
  it('accepte un serveur configuré, local ou distant, sans confirmation supplémentaire', () => {
    expect(directDiagramAssignmentIssue(valid, config)).toBeNull();
    expect(directDiagramAssignmentIssue(valid, { ...config, endpoint: 'https://ai.example/v1/chat/completions' })).toBeNull();
    expect(directDiagramAssignmentIssue(valid, { ...config, endpoint: 'http://192.168.1.42:11434' })).toBeNull();
    expect(directDiagramAssignmentIssue(valid, { ...config, endpoint: 'https://another.example/v1' })).toBeNull();
  });

  it('refuse un barème invalide, un modèle absent ou une configuration manquante', () => {
    expect(directDiagramAssignmentIssue({ ...valid, criteria: [] }, config)).toBeTruthy();
    expect(directDiagramAssignmentIssue({
      ...valid, criteria: [{ ...valid.criteria[0]!, analysisMode: 'text' }],
    }, config)).toBeTruthy();
    expect(directDiagramAssignmentIssue(valid, { ...config, correctionMethod: 'decision' })).toContain('générative');
    expect(directDiagramAssignmentIssue(valid, { ...config, analysisModel: '  ' })).toContain('modèle');
    expect(directDiagramAssignmentIssue(valid, { ...config, endpoint: '' })).toContain('serveur IA');
  });
});

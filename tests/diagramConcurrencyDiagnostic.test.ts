import { describe, expect, it, vi } from 'vitest';
import { gradeDiagramImagesBatch } from '../src/correction/ports/gradeDiagramImages.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC } from '../src/evaluation/domain/scientificDiagramFixtures.ts';
import { diagnosticVariants, orderedDiagnosticVariants, measureDiagramConcurrency } from '../src/evaluation/application/diagramConcurrencyBenchmark.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../src/evaluation/domain/scientificDiagramFixtures.ts';
import type { GradingProvider, GradingRequest } from '../src/correction/ports/aiProvider.ts';
import type { Rubric } from '../src/correction/domain/rubric.ts';

const fixture = SCIENTIFIC_DIAGRAM_FIXTURES.find(f => f.id === 'A')!;
const images = [{ mimeType: 'image/png', base64: 'dGVzdA==', fileName: 'schema.png' }];
function mockGateway(root: string | undefined = 'root') {
  const calls: { request: GradingRequest; incoming?: string; provider: number }[] = [];
  let providerCount = 0;
  const prepareDiagramContext = vi.fn(async () => root);
  const createProvider = () => {
    const provider = ++providerCount;
    const generate: GradingProvider['generate'] = async request => {
      const conversation = request.diagramConversation!;
      calls.push({ request, incoming: conversation.responseId, provider });
      conversation.responseId = 'response-' + calls.length;
      await Promise.resolve();
      const rubric = JSON.parse(request.rubric) as Rubric;
      return JSON.stringify({ summary: 'Test', questionsForTeacher: [], criteria: rubric.criteria.map(c => ({
        criterionId: c.id, points: 0, evidence: 'Observation', confidence: 'high', rationale: 'Test',
        subcriteria: c.subcriteria?.map(s => ({ subcriterionId: s.id, points: 0, evidence: 'Observation' })),
      })) });
    };
    return { id: 'test', generate, prepareDiagramContext };
  };
  return { calls, prepareDiagramContext, createProvider };
}
describe('diagnostic quality matrix', () => {
  it('rotates all five variants across cases and repetitions without dropping any', () => {
    for (let repetition = 1; repetition <= 3; repetition++) {
      for (let caseIndex = 0; caseIndex < 3; caseIndex++) {
        expect(orderedDiagnosticVariants(repetition, caseIndex).map(v => v.id).sort()).toEqual(['A','B','C','D','E']);
      }
    }
    expect(orderedDiagnosticVariants(1, 0)[0]?.id).not.toBe(orderedDiagnosticVariants(2, 0)[0]?.id);
  });
  it.each(diagnosticVariants)('runs $id with the same rubric and correct context isolation', async variant => {
    const gateway = mockGateway();
    const result = await measureDiagramConcurrency(fixture, images, variant.level, gateway.createProvider,
      new AbortController().signal, () => {}, 4, { variant, repetition: 1 });
    expect(result.errors).toEqual([]);
    expect(result.peak).toBe(variant.level);
    expect(result.measured).toBe(19);
    expect(result.diagnostic?.variant).toBe(variant.id);
    expect(Object.values(result.diagnostic!.observedPoints)).toEqual(Array(19).fill(0));
    expect(gateway.calls).toHaveLength(4);
    expect(gateway.calls.every(c => c.request.images === images && c.request.directGenerativeVision)).toBe(true);
    expect(new Set(gateway.calls.map(c => c.request.question)).size).toBe(1);
    expect(new Set(gateway.calls.map(c => JSON.parse(c.request.rubric).criteria[0].id)).size).toBe(4);
    if (variant.id === 'A') {
      expect(gateway.prepareDiagramContext).not.toHaveBeenCalled();
      expect(gateway.calls.map(c => c.incoming)).toEqual([undefined, 'response-1', 'response-2', 'response-3']);
      expect(new Set(gateway.calls.map(c => c.request.diagramConversation)).size).toBe(1);
      expect(new Set(gateway.calls.map(c => c.provider)).size).toBe(1);
    } else {
      expect(new Set(gateway.calls.map(c => c.request.diagramConversation)).size).toBe(4);
      expect(new Set(gateway.calls.map(c => c.provider)).size).toBe(4);
      expect(gateway.prepareDiagramContext).toHaveBeenCalledTimes(variant.contextMode === 'shared' ? 1 : 0);
      expect(gateway.calls.map(c => c.incoming)).toEqual(Array(4).fill(variant.contextMode === 'shared' ? 'root' : undefined));
    }
  });
  it('does not silently substitute fresh images if shared context is unsupported', async () => {
    const gateway = mockGateway('');
    const variant = diagnosticVariants[1];
    const result = await measureDiagramConcurrency(fixture, images, variant.level, gateway.createProvider,
      new AbortController().signal, () => {}, 4, { variant, repetition: 1 });
    expect(result.errors[0]).toContain('contexte partagé');
    expect(result.measured).toBe(0);
    expect(gateway.calls).toHaveLength(0);
  });
});


describe('ordinary batch grading', () => {
  it('starts four independent image requests, never prepares a shared context and merges in rubric order', async () => {
    const gateway = mockGateway();
    const proposal = await gradeDiagramImagesBatch(gateway.createProvider, {
      images, rubric: SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, question: 'Correction',
    });
    expect(gateway.prepareDiagramContext).not.toHaveBeenCalled();
    expect(gateway.calls).toHaveLength(4);
    expect(gateway.calls.every(call => call.incoming === undefined && call.request.images === images)).toBe(true);
    expect(new Set(gateway.calls.map(call => call.provider)).size).toBe(4);
    expect(new Set(gateway.calls.map(call => call.request.diagramConversation)).size).toBe(4);
    expect(proposal.criteria.map(criterion => criterion.criterionId)).toEqual(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.map(criterion => criterion.id));
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { questionGroups } from '../../../src/domain/questionContract.ts';
import {
  QUESTION_CONTRACT_QUESTION, QUESTION_CONTRACT_STRESS_CASES, questionContractRubric,
} from '../../../src/domain/questionContractPilot.ts';
import { parseGradingProposal } from '../../../src/domain/grading.ts';

const verdict = (choice: string) => ({
  type: 'choice' as const, choice, confidence: 0.98, probabilities: { [choice]: 0.98 },
});

describe('decision stress protocol: native scoring + contract evidence isolation', () => {
  it.each(QUESTION_CONTRACT_STRESS_CASES)('$label is evaluated against teacher-authored expectations, not keywords alone', async (testCase) => {
    const rubric = questionContractRubric('contract');
    const groups = questionGroups(rubric.criteria, testCase.transcription, QUESTION_CONTRACT_QUESTION);
    const requests: Array<{ state: string; questions: Record<string, unknown> }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toMatch(/\/v1\/systemone$/);
      const payload = JSON.parse(String(init?.body)) as { state: string; questions: Record<string, unknown> };
      const group = groups[requests.length]!;
      requests.push(payload);
      const answers = Object.fromEntries(Object.keys(payload.questions).map((key) => {
        if (key === 'alignment') return [key, verdict(testCase.id === 'G' ? 'different' : 'aligned')];
        const parts = /^criterion_(\d+)_(expected|support)_(\d+)$/.exec(key);
        if (!parts) throw new Error('Unexpected native question: ' + key);
        const criterion = group.criteria[Number(parts[1]) - 1]!;
        const target = criterion.subcriteria![Number(parts[3]) - 1]!;
        const present = testCase.presentSubcriteria.includes(target.id);
        const answer = parts[2] === 'expected'
          ? present ? 'present' : 'absent'
          : present ? 'supported' : testCase.id === 'G' ? 'not_demonstrated' : 'contradicted';
        return [key, verdict(answer)];
      }));
      return new Response(JSON.stringify({ model: 'tev1:4b', answers }), { status: 200 });
    });

    const raw = await createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b',
      analysisModel: 'tev1:4b', correctionMethod: 'decision',
    }, fetchMock).generate({
      question: QUESTION_CONTRACT_QUESTION, rubric: JSON.stringify(rubric),
      transcription: testCase.transcription,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requests[0]!.state).not.toContain(groups[1]!.transcription);
    expect(requests[1]!.state).not.toContain(groups[0]!.transcription);
    if (testCase.id === 'G') expect(requests.every((request) => !request.state.includes('Énoncé imprimé :'))).toBe(true);

    const proposal = parseGradingProposal(raw, rubric);
    expect(proposal.finalScore).toBe(testCase.referenceScore);
    expect(proposal.scoreIncomplete).not.toBe(true);
    expect(proposal.criteria.flatMap((criterion) => criterion.subcriteria ?? [])
      .filter((subcriterion) => subcriterion.assessmentStatus === 'not-evaluated')).toHaveLength(0);
  });
});

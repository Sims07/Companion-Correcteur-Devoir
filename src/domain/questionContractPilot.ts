import { isLoopbackPilotEndpoint } from './pilotEvaluationProtocol.ts';
import type { ModelEvaluationRecord } from './modelEvaluation.ts';
import type { Rubric } from './rubric.ts';
import type { PilotCase } from './pilotEvaluationProtocol.ts';
import { PILOT_RUBRIC, summarizePilotResult } from './pilotEvaluationProtocol.ts';

/**
 * A reproducible, artificial exam: teacher-approved example contracts are fixtures,
 * not requirements injected into the normal correction prompts or a live rubric.
 */
export const QUESTION_CONTRACT_PROTOCOL_ID = 'biologie-questions-contrats-v1';
export const QUESTION_CONTRACT_TITLE = 'Pilote questions séparées — photosynthèse et respiration (10 points)';
export const QUESTION_CONTRACT_QUESTION = [
  'Question 1 (6 points) — Décrivez la photosynthèse : lieu, source d’énergie, réactifs et produits.',
  'Question 2 (4 points) — Expliquez la respiration aérobie des cellules végétales : lieu, besoin en oxygène, ATP et fonctionnement nocturne.',
].join('\n');
export type QuestionContractVariant = 'standard' | 'contract';
export type QuestionContractCase = PilotCase;

const instructions = {
  '1': 'Décrivez la photosynthèse : lieu, source d’énergie, réactifs et produits.',
  '2': 'Expliquez la respiration aérobie des cellules végétales : lieu, besoin en oxygène, ATP et fonctionnement nocturne.',
};

const teacherContracts: Record<string, { question: '1' | '2'; expectedRelation: string; acceptedAlternatives: string; contradictions: string }> = {
  c1: {
    question: '1',
    expectedRelation: 'La photosynthèse a lieu dans les chloroplastes et utilise la lumière comme source d’énergie.',
    acceptedAlternatives: 'Énergie lumineuse ou rayonnement lumineux ; chloroplaste au singulier.',
    contradictions: 'Photosynthèse hors des chloroplastes ou sans lumière.',
  },
  c2: {
    question: '1',
    expectedRelation: 'La photosynthèse utilise le dioxyde de carbone et l’eau comme réactifs.',
    acceptedAlternatives: 'CO₂ pour dioxyde de carbone ; H₂O pour eau ; prélève ou consomme.',
    contradictions: 'Affirmer que le CO₂ et l’eau sont rejetés au lieu d’être utilisés.',
  },
  c3: {
    question: '1',
    expectedRelation: 'La photosynthèse synthétise des sucres et libère du dioxygène.',
    acceptedAlternatives: 'Glucides ou matière organique pour sucres ; O₂ pour dioxygène.',
    contradictions: 'Dire que les sucres ou le dioxygène sont consommés, sans production correspondante.',
  },
  c4: {
    question: '2',
    expectedRelation: 'La respiration aérobie se déroule principalement dans les mitochondries et consomme du dioxygène.',
    acceptedAlternatives: 'Mitochondrie au singulier ; O₂ pour dioxygène.',
    contradictions: 'Respiration aérobie hors des mitochondries ou sans consommation d’oxygène.',
  },
  c5: {
    question: '2',
    expectedRelation: 'La respiration dégrade de la matière organique pour produire de l’ATP et se poursuit sans lumière, la nuit.',
    acceptedAlternatives: 'Énergie sous forme d’ATP ; obscurité pour nuit.',
    contradictions: 'Dire que la respiration consomme l’ATP au lieu d’en produire ou s’arrête la nuit.',
  },
};

export function questionContractRubric(variant: QuestionContractVariant): Rubric {
  const rubric: Rubric = structuredClone(PILOT_RUBRIC);
  rubric.title = QUESTION_CONTRACT_TITLE;
  if (variant === 'contract') {
    rubric.criteria = rubric.criteria.map((criterion) => {
      const source = teacherContracts[criterion.id];
      if (!source) throw new Error('Contrat de référence absent pour ' + criterion.id);
      return {
        ...criterion,
        correctionContract: {
          question: { id: source.question, instruction: instructions[source.question] },
          expectedRelation: source.expectedRelation,
          acceptedAlternatives: source.acceptedAlternatives,
          contradictions: source.contradictions,
        },
      };
    });
  }
  return rubric;
}

export const QUESTION_CONTRACT_CASES: readonly QuestionContractCase[] = [
  {
    id: 'A', label: 'A — complète', description: 'Deux questions correctement répondues, 10 attendus présents.',
    transcription: [
      'Question 1',
      'Réponse :',
      'La photosynthèse se déroule dans les chloroplastes. La lumière fournit l’énergie nécessaire. La cellule utilise du dioxyde de carbone (CO₂) et de l’eau (H₂O), fabrique des sucres et libère du dioxygène (O₂).',
      'Question 2',
      'Réponse :',
      'La respiration aérobie se déroule principalement dans les mitochondries et consomme du dioxygène. La dégradation de molécules organiques produit de l’ATP. Les cellules végétales respirent aussi pendant la nuit.',
    ].join('\n'),
    referenceScore: 10,
    presentSubcriteria: ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'],
  },
  {
    id: 'B', label: 'B — réponses inversées', description: 'Les notions sont justes, mais les réponses 1 et 2 sont échangées : 0 attendu dans la bonne question.',
    transcription: [
      'Question 1',
      'Réponse :',
      'La respiration aérobie a lieu dans les mitochondries et consomme du dioxygène. Elle produit de l’ATP à partir de matière organique et se poursuit la nuit.',
      'Question 2',
      'Réponse :',
      'La photosynthèse a lieu dans les chloroplastes avec de la lumière. Elle utilise du dioxyde de carbone et de l’eau, produit des sucres et libère du dioxygène.',
    ].join('\n'),
    referenceScore: 0,
    presentSubcriteria: [],
  },
  {
    id: 'C', label: 'C — partielle', description: 'Quatre attendus en question 1, un en question 2.',
    transcription: [
      'Question 1',
      'Réponse :',
      'La photosynthèse se déroule dans les chloroplastes grâce à la lumière. Elle utilise du CO₂ pour produire des sucres. Je ne connais pas les autres réactifs ni les autres produits.',
      'Question 2',
      'Réponse :',
      'La respiration aérobie se déroule principalement dans les mitochondries. Je ne connais pas les autres éléments demandés.',
    ].join('\n'),
    referenceScore: 5,
    presentSubcriteria: ['p1','p2','p3','p5','p7'],
  },
];

export interface QuestionContractRun {
  caseId: QuestionContractCase['id'];
  variant: QuestionContractVariant;
  record: ModelEvaluationRecord;
}

/** The resulting JSON contains only synthetic answers, public benchmark metadata and text traces. */
export function buildQuestionContractReport(runs: readonly QuestionContractRun[], createdAt: string) {
  const experiments = runs.flatMap(({ caseId, variant, record }) => {
    const testCase = QUESTION_CONTRACT_CASES.find((item) => item.id === caseId);
    if (!testCase) throw new Error('Cas de test de contrat inconnu : ' + caseId);
    return record.results.map((result) => {
      const configuration = record.configurations.find((item) => item.id === result.profileId);
      return {
        caseId, variant, profileId: result.profileId, profile: result.profileName,
        analysisModel: configuration?.analysisModel ?? '', method: configuration?.correctionMethod ?? 'generative',
        provider: configuration?.apiCompatible ? 'openai-compatible' : 'ollama',
        completedAt: record.completedAt, status: result.status, error: result.error ?? null,
        score: result.score, referenceScore: testCase.referenceScore,
        benchmark: summarizePilotResult(testCase, result),
        durationMs: result.elapsedMs, analysisMs: result.analysisMs, tokens: result.tokens,
        proposal: result.proposal, raw: result.raw, transcription: result.transcription,
        traces: (result.diagnosticRuns ?? []).map((trace) => ({
          stage: trace.stage, kind: trace.kind, model: trace.model, promptId: trace.promptId,
          promptVersion: trace.promptVersion, requestPrompt: trace.requestPrompt,
          raw: trace.raw, error: trace.error, elapsedMs: trace.elapsedMs,
          doneReason: trace.doneReason, generatedTokens: trace.generatedTokens,
          promptTokens: trace.promptTokens, totalTokens: trace.totalTokens,
        })),
      };
    });
  });
  const comparison = QUESTION_CONTRACT_CASES.flatMap((testCase) => {
    const profiles = new Set(experiments.filter((item) => item.caseId === testCase.id).map((item) => item.profileId));
    return [...profiles].map((profileId) => {
      const standard = experiments.find((item) => item.caseId === testCase.id && item.profileId === profileId && item.variant === 'standard');
      const contract = experiments.find((item) => item.caseId === testCase.id && item.profileId === profileId && item.variant === 'contract');
      return {
        caseId: testCase.id, profileId, profile: contract?.profile ?? standard?.profile ?? profileId,
        referenceScore: testCase.referenceScore,
        standard: standard ? { status: standard.status, score: standard.score, ...standard.benchmark, durationMs: standard.durationMs } : null,
        contract: contract ? { status: contract.status, score: contract.score, ...contract.benchmark, durationMs: contract.durationMs } : null,
        differenceInCorrectExpectations: standard && contract ? contract.benchmark.correct - standard.benchmark.correct : null,
      };
    });
  });
  return {
    format: 'companion-question-contract-pilot-report',
    version: 1,
    protocolId: QUESTION_CONTRACT_PROTOCOL_ID,
    createdAt,
    localOnly: runs.every(({ record }) => record.configurations.every((configuration) => isLoopbackPilotEndpoint(configuration.endpoint))),
    limitations: 'Jeu de réponses synthétiques, contrats de référence déjà renseignés pour mesurer la correction, pas la qualité de leur génération automatique. Trois cas exploratoires ne prouvent pas la fiabilité pédagogique. Les points incertains/non évalués ne sont jamais comptés comme des zéros.',
    question: QUESTION_CONTRACT_QUESTION,
    rubricStandard: questionContractRubric('standard'),
    rubricVariantB: questionContractRubric('contract'),
    cases: QUESTION_CONTRACT_CASES.map(({ id, label, description, transcription, referenceScore, presentSubcriteria }) =>
      ({ id, label, description, transcription, referenceScore, expectedSubcriteria: Object.fromEntries(
        PILOT_RUBRIC.criteria.flatMap((criterion) => (criterion.subcriteria ?? []).map((sub) =>
          [sub.id, presentSubcriteria.includes(sub.id) ? 1 : 0])),
      ) })),
    experiments,
    comparison,
  };
}

import { defaultAiModelConfiguration, type AiModelProfile } from './aiModelProfiles.ts';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import type { Rubric } from './rubric.ts';

export const PILOT_PROTOCOL_ID = 'biologie-photosynthese-respiration-v1';
export const PILOT_QUESTION = 'Chez une cellule végétale, expliquez la photosynthèse et la respiration aérobie : lieu, besoins, produits, production d’ATP et respiration en l’absence de lumière.';
export const PILOT_TITLE = 'Pilote décisionnel — photosynthèse et respiration (10 points)';

export const PILOT_RUBRIC: Rubric = {
  title: PILOT_TITLE,
  criteria: [
    { id: 'c1', title: 'Photosynthèse : lieu et énergie', description: 'Vérifier le lieu et le rôle de la lumière dans la photosynthèse.', maxPoints: 2, analysisMode: 'text', subcriteria: [
      { id: 'p1', title: 'Lieu : chloroplastes', description: 'La réponse affirme que la photosynthèse se déroule dans les chloroplastes.', maxPoints: 1 },
      { id: 'p2', title: 'Énergie : lumière', description: 'La réponse établit que la lumière fournit l’énergie nécessaire à la photosynthèse.', maxPoints: 1 },
    ] },
    { id: 'c2', title: 'Photosynthèse : réactifs', description: 'Vérifier les deux substances utilisées par la photosynthèse.', maxPoints: 2, analysisMode: 'text', subcriteria: [
      { id: 'p3', title: 'CO₂ utilisé', description: 'Le dioxyde de carbone est utilisé ou prélevé pour la photosynthèse, pas rejeté comme réactif.', maxPoints: 1 },
      { id: 'p4', title: 'H₂O utilisée', description: 'L’eau est utilisée ou prélevée pour la photosynthèse.', maxPoints: 1 },
    ] },
    { id: 'c3', title: 'Photosynthèse : produits', description: 'Vérifier les produits de la photosynthèse.', maxPoints: 2, analysisMode: 'text', subcriteria: [
      { id: 'p5', title: 'Sucres synthétisés', description: 'La photosynthèse permet de synthétiser des molécules organiques, par exemple des sucres.', maxPoints: 1 },
      { id: 'p6', title: 'O₂ libéré', description: 'La photosynthèse libère du dioxygène.', maxPoints: 1 },
    ] },
    { id: 'c4', title: 'Respiration aérobie : lieu et besoin', description: 'Vérifier le lieu principal et la consommation d’oxygène dans la respiration aérobie.', maxPoints: 2, analysisMode: 'text', subcriteria: [
      { id: 'p7', title: 'Mitochondries', description: 'La respiration aérobie se déroule principalement dans les mitochondries.', maxPoints: 1 },
      { id: 'p8', title: 'O₂ consommé', description: 'La respiration aérobie consomme du dioxygène.', maxPoints: 1 },
    ] },
    { id: 'c5', title: 'Respiration : énergie et nuit', description: 'Vérifier la production d’énergie utilisable et la respiration en absence de lumière.', maxPoints: 2, analysisMode: 'text', subcriteria: [
      { id: 'p9', title: 'ATP produit', description: 'La dégradation de substrats organiques au cours de la respiration permet de produire de l’ATP.', maxPoints: 1 },
      { id: 'p10', title: 'Respiration dans la nuit', description: 'Les cellules végétales continuent de respirer dans l’obscurité, y compris la nuit.', maxPoints: 1 },
    ] },
  ],
};

export interface PilotCase {
  id: 'A' | 'B' | 'C';
  label: string;
  description: string;
  transcription: string;
  referenceScore: number;
  /** IDs of the 1-point teacher subcriteria actually demonstrated by the student. */
  presentSubcriteria: readonly string[];
}

export const PILOT_CASES: readonly PilotCase[] = [
  {
    id: 'A', label: 'A — correcte', description: 'Dix attendus exacts ; une réponse complète.',
    transcription: 'Réponse de l’étudiant\nLa photosynthèse se déroule dans les chloroplastes des cellules végétales. Grâce à l’énergie de la lumière, elle utilise le dioxyde de carbone (CO₂) et l’eau (H₂O) pour fabriquer des molécules organiques, notamment des sucres, et elle libère du dioxygène (O₂). La respiration aérobie se déroule principalement dans les mitochondries et consomme du dioxygène. Elle dégrade des molécules organiques pour produire de l’ATP. Une cellule végétale continue aussi de respirer pendant la nuit.',
    referenceScore: 10,
    presentSubcriteria: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'],
  },
  {
    id: 'B', label: 'B — inversions', description: 'Mots-clés présents, relations scientifiques fausses et négations.',
    transcription: 'Réponse de l’étudiant\nLa photosynthèse ne se déroule pas dans les chloroplastes et elle n’a pas besoin de lumière. Elle rejette le dioxyde de carbone (CO₂) et l’eau (H₂O) au lieu de les utiliser. Elle consomme les sucres et le dioxygène (O₂) et ne fabrique pas de matière organique. La respiration aérobie ne se déroule pas dans les mitochondries et ne consomme pas de dioxygène. Elle consomme de l’ATP au lieu d’en produire. Une cellule végétale ne respire jamais pendant la nuit.',
    referenceScore: 0,
    presentSubcriteria: [],
  },
  {
    id: 'C', label: 'C — partielle', description: 'Cinq attendus exacts, les autres absents.',
    transcription: 'Réponse de l’étudiant\nLa photosynthèse se déroule dans les chloroplastes et a besoin de l’énergie lumineuse. La cellule utilise du dioxyde de carbone pour cette réaction. Elle peut fabriquer des sucres. La respiration aérobie se déroule principalement dans les mitochondries. Je ne sais pas quels autres réactifs et produits interviennent, ni ce qui se passe la nuit.',
    referenceScore: 5,
    presentSubcriteria: ['p1', 'p2', 'p3', 'p5', 'p7'],
  },
];

/** A pilot run may only send student-copy images to the local Ollama instance. */
export function isLocalPilotProfile(profile: AiModelProfile): boolean {
  if (profile.configuration.apiCompatible || profile.configuration.apiKey) return false;
  try {
    const url = new URL(profile.configuration.endpoint);
    return url.protocol === 'http:' && !url.username && !url.password &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export function makePilotProfiles(endpoint: string, timestamp: string): AiModelProfile[] {
  // Only local Ollama: no configured cloud endpoint or credential may be inherited.
  const localEndpoint = (() => {
    try {
      const url = new URL(endpoint);
      return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ? url.origin : defaultAiModelConfiguration.endpoint;
    } catch { return defaultAiModelConfiguration.endpoint; }
  })();
  return [
    { id: 'pilot-biology-qwen', name: 'Pilote · Qwen génératif', model: 'qwen3.5:4b', method: 'generative' as const },
    { id: 'pilot-biology-d1', name: 'Pilote · D1 décisionnel', model: 'd1:3b', method: 'decision' as const },
    { id: 'pilot-biology-tev', name: 'Pilote · TEV1 décisionnel', model: 'tev1:4b', method: 'decision' as const },
  ].map((preset): AiModelProfile => ({
    id: preset.id, name: preset.name, mode: 'single', updatedAt: timestamp,
    configuration: {
      ...defaultAiModelConfiguration,
      endpoint: localEndpoint,
      visionModel: 'qwen3.5:4b',
      analysisModel: preset.model,
      correctionMethod: preset.method,
      criterionByCriterion: true,
      analysisThinking: false,
      apiCompatible: false,
      apiKey: '',
    },
  }));
}

export interface PilotRun {
  caseId: PilotCase['id'];
  record: ModelEvaluationRecord;
}

export interface PilotSubcriterionResult {
  id: string;
  expected: 0 | 1;
  awarded: number | null;
  outcome: 'correct' | 'false-positive' | 'false-negative' | 'unresolved';
  evidence?: string;
}

export function summarizePilotResult(testCase: PilotCase, result: ModelEvaluationResultSnapshot): {
  correct: number; falsePositives: number; falseNegatives: number; unresolved: number;
  subcriteria: PilotSubcriterionResult[];
} {
  const subcriteria: PilotSubcriterionResult[] = PILOT_RUBRIC.criteria.flatMap((criterion) =>
    (criterion.subcriteria ?? []).map((sub) => {
      const expected: 0 | 1 = testCase.presentSubcriteria.includes(sub.id) ? 1 : 0;
      const criterionProposal = result.proposal?.criteria.find((item) => item.criterionId === criterion.id);
      const assessment = criterionProposal?.subcriteria?.find((item) => item.subcriterionId === sub.id);
      // New reports carry independent verdicts per subcriterion. Do not erase a
      // reliable sibling merely because a different subcriterion is pending.
      // Older archives without per-item statuses retain the conservative
      // criterion-wide fallback.
      const granular = Boolean(criterionProposal?.subcriteria?.some((entry) =>
        entry.assessmentStatus !== undefined || entry.evidenceStatus !== undefined));
      const notEvaluated = granular
        ? assessment?.assessmentStatus === 'not-evaluated'
        : criterionProposal?.assessmentStatus === 'not-evaluated';
      const awarded = result.status !== 'success' || notEvaluated || !assessment
        ? null : assessment.points;
      const outcome: PilotSubcriterionResult['outcome'] = awarded === null ? 'unresolved'
        : awarded === expected ? 'correct' : expected === 0 ? 'false-positive' : 'false-negative';
      return { id: sub.id, expected, awarded, outcome, ...(assessment?.evidence ? { evidence: assessment.evidence } : {}) };
    })
  );
  return {
    correct: subcriteria.filter((item) => item.outcome === 'correct').length,
    falsePositives: subcriteria.filter((item) => item.outcome === 'false-positive').length,
    falseNegatives: subcriteria.filter((item) => item.outcome === 'false-negative').length,
    unresolved: subcriteria.filter((item) => item.outcome === 'unresolved').length,
    subcriteria,
  };
}

/** The exported artifact is standalone for review, never includes photographs, API keys or endpoints. */
export function buildPilotReport(runs: readonly PilotRun[], createdAt: string) {
  return {
    format: 'companion-correcteur-pilot-report',
    version: 1,
    protocolId: PILOT_PROTOCOL_ID,
    createdAt,
    localOnly: true,
    limitations: 'Résultats expérimentaux sur trois réponses synthétiques. Les scores incomplets ne sont pas des zéros ; la confiance des modèles ne certifie pas la justesse biologique.',
    question: PILOT_QUESTION,
    rubric: structuredClone(PILOT_RUBRIC),
    cases: PILOT_CASES.map((testCase) => ({
      id: testCase.id, label: testCase.label, transcriptionReference: testCase.transcription,
      referenceScore: testCase.referenceScore,
      expectedSubcriteria: Object.fromEntries(PILOT_RUBRIC.criteria.flatMap((criterion) => (criterion.subcriteria ?? [])
        .map((sub) => [sub.id, testCase.presentSubcriteria.includes(sub.id) ? 1 : 0]))),
    })),
    experiments: runs.map(({ caseId, record }) => {
      const testCase = PILOT_CASES.find((item) => item.id === caseId);
      if (!testCase) throw new Error('Cas de protocole inconnu.');
      return {
        caseId, stage: record.stage ?? 'integrated', completedAt: record.completedAt,
        modelResults: record.results.map((result) => ({
          profile: result.profileName,
          visionModel: record.configurations.find((item) => item.id === result.profileId)?.visionModel ?? '',
          analysisModel: record.configurations.find((item) => item.id === result.profileId)?.analysisModel ?? '',
          method: record.configurations.find((item) => item.id === result.profileId)?.correctionMethod ?? 'generative',
          status: result.status, error: result.error ?? null, score: result.score,
          referenceScore: testCase.referenceScore,
          durationMs: { reading: result.readingMs, analysis: result.analysisMs, total: result.elapsedMs },
          tokens: { reading: result.readingTokens ?? null, analysis: result.analysisTokens ?? null, total: result.tokens },
          transcription: result.transcription, proposal: result.proposal, raw: result.raw,
          benchmark: summarizePilotResult(testCase, result),
          traces: (result.diagnosticRuns ?? []).map((trace) => ({
            stage: trace.stage, kind: trace.kind, model: trace.model,
            promptId: trace.promptId, promptVersion: trace.promptVersion,
            requestPrompt: trace.requestPrompt, raw: trace.raw, error: trace.error,
            elapsedMs: trace.elapsedMs, doneReason: trace.doneReason,
            promptTokens: trace.promptTokens, generatedTokens: trace.generatedTokens,
            totalTokens: trace.totalTokens, loadMs: trace.loadMs,
            promptEvaluationMs: trace.promptEvaluationMs, generationMs: trace.generationMs,
            // Intentionally exclude requestPayload, requestMetadata, image bytes, endpoint and credentials.
          })),
        })),
      };
    }),
  };
}

import { sumGradeScores } from '../../shared/domain/scorePrecision.ts';
import { gradeDiagramImages, getRubricSubcriteria, type GradingProvider, type GradingProposal } from '../../correction/api/index.ts';
import type { CriterionLevel } from '../../shared/domain/criterionConcurrency.ts';
import type { ImageInput } from '../../shared/domain/imageInput.ts';
import { diagramTargetKey } from '../domain/scientificDiagramProtocol.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT, SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, type ScientificDiagramFixtureCase } from '../domain/scientificDiagramFixtures.ts';

export const diagnosticVariants = [
  { id: 'A', label: 'Conversation cumulative · ×1', level: 1, contextMode: undefined },
  { id: 'B', label: 'Contexte partagé · ×1', level: 1, contextMode: 'shared' },
  { id: 'C', label: 'Contexte partagé · ×4', level: 4, contextMode: 'shared' },
  { id: 'D', label: 'Image indépendante · ×1', level: 1, contextMode: 'independent' },
  { id: 'E', label: 'Image indépendante · ×4', level: 4, contextMode: 'independent' },
] as const;
export type DiagnosticVariant = typeof diagnosticVariants[number];

/** Rotate the order to limit systematic warm-cache/order bias. */
export function orderedDiagnosticVariants(repetition: number, caseIndex: number) {
  const offset = (repetition - 1 + caseIndex) % diagnosticVariants.length;
  return [...diagnosticVariants.slice(offset), ...diagnosticVariants.slice(0, offset)];
}

export function concurrencyBenchmarkRubric(groups: 4 | 8) {
  const original = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC;
  if (groups === 4) return original;
  return { ...original, criteria: original.criteria.flatMap(criterion => {
    const targets = getRubricSubcriteria(criterion);
    const middle = Math.ceil(targets.length / 2);
    return [targets.slice(0, middle), targets.slice(middle)].map((subcriteria, i) => ({
      ...criterion, id: criterion.id + '/group-' + (i + 1), subcriteria,
      maxPoints: sumGradeScores(subcriteria.map(sub => sub.maxPoints)),
    }));
  }) };
}

export async function measureDiagramConcurrency(fixture: ScientificDiagramFixtureCase, images: ImageInput[],
  level: CriterionLevel, createProvider: () => GradingProvider, signal: AbortSignal, progress: (completed: number) => void, groups: 4 | 8 = 4,
  diagnostic?: { variant: DiagnosticVariant; repetition: number }) {
  const rubric = concurrencyBenchmarkRubric(groups);
  const errors: string[] = [];
  const tokens: number[] = [];
  const calls: { promptTokens?: number; generatedTokens?: number; elapsedMs: number; doneReason?: string; imageCount?: number; promptId?: string; promptVersion?: number; contextTokens?: number; generationTokenLimit?: number; requestCount?: number }[] = [];
  let active = 0, peak = 0, completed = 0;
  let proposal: GradingProposal | undefined;
  const started = performance.now();
  try {
    proposal = await gradeDiagramImages(createProvider(), {
      images, rubric, question: SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT, signal, execution: { level, createProvider, contextMode: diagnostic?.variant.contextMode },
      onCriterion: (_index, _title, result) => {
        if (result) { active--; progress(++completed); }
        else peak = Math.max(peak, ++active);
      },
      onCriterionFailure: (index, cause) => {
        errors.push(rubric.criteria[index]!.title + ' · ' + String(cause));
        active--; progress(++completed);
      },
      onDiagnosticResult: trace => {
        if (trace.stage === 'analysis' && !trace.requestCount) {
          tokens.push(trace.generatedTokens ?? NaN);
          if (diagnostic) calls.push({ promptTokens: trace.promptTokens, generatedTokens: trace.generatedTokens,
            elapsedMs: trace.elapsedMs, doneReason: trace.doneReason, imageCount: trace.requestMetadata?.imageCount,
            promptId: trace.promptId, promptVersion: trace.promptVersion, contextTokens: trace.contextTokens,
            generationTokenLimit: trace.generationTokenLimit });
        }
      },
    }, true);
  } catch (error) {
    signal.throwIfAborted();
    if (!errors.length) errors.push(String(error));
  }
  const durationMs = performance.now() - started;
  const deviations: Record<string, number | null> = { ...fixture.referencePoints };
  for (const key of Object.keys(deviations)) deviations[key] = null;
  const observedPoints = { ...deviations };
  for (const criterion of proposal?.criteria ?? []) {
    for (const sub of criterion.subcriteria ?? []) {
      const key = diagramTargetKey(criterion.criterionId.split('/group-')[0], sub.subcriterionId);
      if (key in deviations && criterion.assessmentStatus !== 'not-evaluated' && sub.assessmentStatus !== 'not-evaluated') {
        deviations[key] = Math.abs(sub.points - fixture.referencePoints[key]!);
        observedPoints[key] = sub.points;
      }
    }
  }
  const measured = Object.values(deviations).filter((n): n is number => n !== null);
  const generated = tokens.length >= completed && tokens.length && tokens.every(Number.isFinite)
    ? tokens.reduce((a, b) => a + b, 0) : null;
  return { caseId: fixture.id, groups, level, peak, durationMs, errors, deviations, measured: measured.length,
    exact: measured.filter(n => n < 0.001).length,
    diagnostic: diagnostic ? { variant: diagnostic.variant.id, contextMode: diagnostic.variant.contextMode ?? 'cumulative',
      repetition: diagnostic.repetition, observedPoints, referencePoints: fixture.referencePoints, calls } : undefined,
    tokensPerSecond: generated !== null && durationMs > 0 ? generated * 1000 / durationMs : null };
}
export type DiagramConcurrencySample = Awaited<ReturnType<typeof measureDiagramConcurrency>>;

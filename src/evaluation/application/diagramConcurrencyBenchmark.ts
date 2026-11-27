import { gradeDiagramImages, type GradingProvider, type GradingProposal } from '../../correction/api/index.ts';
import type { CriterionLevel } from '../../shared/domain/criterionConcurrency.ts';
import type { ImageInput } from '../../shared/domain/imageInput.ts';
import { diagramTargetKey } from '../domain/scientificDiagramProtocol.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT, SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, type ScientificDiagramFixtureCase } from '../domain/scientificDiagramFixtures.ts';

export async function measureDiagramConcurrency(fixture: ScientificDiagramFixtureCase, images: ImageInput[],
  level: CriterionLevel, createProvider: () => GradingProvider, signal: AbortSignal, progress: (completed: number) => void) {
  const rubric = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC;
  const errors: string[] = [];
  const tokens: number[] = [];
  let active = 0, peak = 0, completed = 0;
  let proposal: GradingProposal | undefined;
  const started = performance.now();
  try {
    proposal = await gradeDiagramImages(createProvider(), {
      images, rubric, question: SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT, signal, execution: { level, createProvider },
      onCriterion: (_index, _title, result) => {
        if (result) { active--; progress(++completed); }
        else peak = Math.max(peak, ++active);
      },
      onCriterionFailure: (index, cause) => {
        errors.push(rubric.criteria[index]!.title + ' · ' + String(cause));
        active--; progress(++completed);
      },
      onDiagnosticResult: trace => {
        if (trace.stage === 'analysis' && !trace.requestCount) tokens.push(trace.generatedTokens ?? NaN);
      },
    }, true);
  } catch (error) {
    signal.throwIfAborted();
    if (!errors.length) errors.push(String(error));
  }
  const durationMs = performance.now() - started;
  const deviations: Record<string, number | null> = { ...fixture.referencePoints };
  for (const key of Object.keys(deviations)) deviations[key] = null;
  for (const criterion of proposal?.criteria ?? []) {
    for (const sub of criterion.subcriteria ?? []) {
      const key = diagramTargetKey(criterion.criterionId, sub.subcriterionId);
      if (key in deviations && criterion.assessmentStatus !== 'not-evaluated' && sub.assessmentStatus !== 'not-evaluated')
        deviations[key] = Math.abs(sub.points - fixture.referencePoints[key]!);
    }
  }
  const measured = Object.values(deviations).filter((n): n is number => n !== null);
  const generated = tokens.length >= completed && tokens.length && tokens.every(Number.isFinite)
    ? tokens.reduce((a, b) => a + b, 0) : null;
  return { caseId: fixture.id, level, peak, durationMs, errors, deviations, measured: measured.length,
    exact: measured.filter(n => n < 0.001).length,
    tokensPerSecond: generated !== null && durationMs > 0 ? generated * 1000 / durationMs : null };
}
export type DiagramConcurrencySample = Awaited<ReturnType<typeof measureDiagramConcurrency>>;

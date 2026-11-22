import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import {
  buildDiagramLabRadar, type RadarAxisId, type RadarModelConfiguration,
  type RadarCandidate, type RadarRankedCandidate,
} from './diagramLabRadar.ts';
import {
  planMissingRadarAxis, planRadarModelEvaluation, resolveModelProfile,
  type RadarMissingTestRequest, type RadarTestStep,
} from './diagramLabRadarLaunch.ts';
import type { ScienceMethod } from './radarTimeline.ts';

/** Radar evidence belongs to a saved CONFIGURATION, not just its LLM identifier.
 * Filter each report's experiments, not only its archive entries: a single
 * campaign can contain several configurations of exactly the same model. */
export function scopeRadarEntries(
  entries: readonly DiagramLabArchiveEntry[], profileId: string,
): DiagramLabArchiveEntry[] {
  return entries.flatMap(entry => {
    if (!('cases' in entry.report)) return [];
    const cases = entry.report.cases.map(testCase => ({
      ...testCase,
      experiments: testCase.experiments.filter(run => run.profileId === profileId),
    }));
    if (!cases.some(testCase => testCase.experiments.length)) return [];
    return [{ ...entry, report: { ...entry.report, cases } as DiagramLabArchiveEntry['report'] }];
  });
}

export function radarConfigurationLabel(profile: RadarModelConfiguration): string {
  const config = profile.configuration;
  const think = config.apiCompatible && config.omitReasoningParameter ? 'Reasoning non envoyé' : config.analysisThinking
    ? 'Think ' + (config.apiCompatible ? config.analysisReasoningEffort ?? 'medium' : 'On')
    : 'Think Off';
  return profile.name + ' · ' + think;
}

/** Translate the saved thinking choice into the actual Ollama/LM Studio request.
 * Chat Completions maps false -> reasoning_effort: none and a level -> that
 * exact reasoning_effort; never leave the backend to choose its default. */
export function radarProfileThinking(configuration: {
  analysisThinking?: boolean;
  apiCompatible?: boolean;
  analysisReasoningEffort?: 'low' | 'medium' | 'high';
}): boolean | string {
  return configuration.analysisThinking
    ? configuration.apiCompatible ? configuration.analysisReasoningEffort ?? 'medium' : true
    : false;
}

/** Keep archived profiles visible even after their configuration is deleted.
 * Each configuration receives its own radar, including an untested one. */
export function buildConfigurationRadars(
  entries: readonly DiagramLabArchiveEntry[],
  profiles: readonly RadarModelConfiguration[],
): RadarCandidate[] {
  const settings = new Map<string, { id: string; name: string; model: string }>();
  for (const entry of entries) {
    if (!('cases' in entry.report)) continue;
    for (const testCase of entry.report.cases) {
      for (const run of testCase.experiments) {
        if (run.profileId && run.model?.trim() && !settings.has(run.profileId))
          settings.set(run.profileId, { id: run.profileId, name: run.profileName || run.profileId, model: run.model.trim() });
      }
    }
  }
  for (const profile of profiles) {
    const model = profile.configuration.analysisModel.trim();
    if (model) settings.set(profile.id, { id: profile.id, name: radarConfigurationLabel(profile), model });
  }
  return [...settings.values()].flatMap(setting => {
    const scoped = scopeRadarEntries(entries, setting.id);
    const evaluated = buildDiagramLabRadar(scoped, 'model', [{
      id: setting.id, name: setting.name,
      configuration: { visionModel: '', analysisModel: setting.model },
    }]).find(candidate => candidate.id === setting.model);
    return evaluated ? [{
      ...evaluated, id: setting.id, profileId: setting.id, name: setting.name,
      models: [setting.model],
    }] : [];
  });
}

export function configurationModelCandidate(candidate: RadarCandidate): RadarCandidate {
  const id = candidate.models[0] ?? '';
  return { ...candidate, id, name: id };
}

/** Every launch is pinned to the selected configuration; never select another
 * profile sharing the same analysisModel (and a different reasoning effort). */
export function configuredRadarPlan(
  candidate: RadarRankedCandidate,
  entries: readonly DiagramLabArchiveEntry[],
  profiles: readonly RadarModelConfiguration[],
  options: { axis?: RadarAxisId; steps?: RadarTestStep[]; strategy?: ScienceMethod } = {},
): Omit<RadarMissingTestRequest, 'id'> | null {
  const model = configurationModelCandidate(candidate);
  const scoped = scopeRadarEntries(entries, candidate.profileId);
  const plan = options.steps
    ? { axis: options.axis ?? 'graphics' as RadarAxisId, profileId: candidate.profileId,
        profileName: candidate.name, steps: options.steps }
    : options.axis
      ? planMissingRadarAxis(model, options.axis, 'model', scoped)
      : planRadarModelEvaluation(model, scoped);
  return resolveModelProfile(
    profiles.filter(profile => profile.id === candidate.profileId), 'model',
    model as RadarRankedCandidate, plan, options.strategy,
  );
}

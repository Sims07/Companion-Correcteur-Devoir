import type { AiModelConfiguration } from '../domain/aiModelProfiles.ts';
import type { ImageInput } from '../domain/imageInput.ts';
import type { LogprobDecision, LogprobTarget } from '../domain/visualLogprobDecision.ts';

export type LogprobSettings = Pick<AiModelConfiguration, 'endpoint' | 'apiCompatible' |
  'apiKey' | 'analysisModel' | 'correctionMethod' | 'omitReasoningParameter'>;

export type VisualLogprobProbe = (settings: LogprobSettings, images: readonly ImageInput[],
  target: LogprobTarget, context: string, signal: AbortSignal) => Promise<LogprobDecision>;

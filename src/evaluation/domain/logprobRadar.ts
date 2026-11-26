import type { LogprobDecision } from '../../shared/domain/visualLogprobDecision.ts';
export type LogprobRadarMethod = 'direct-image-logprobs' | 'direct-image-hybrid' | 'direct-image-hybrid-zoom';
export function isLogprobRadarMethod(method: unknown): method is LogprobRadarMethod {
  return method === 'direct-image-logprobs' || method === 'direct-image-hybrid' || method === 'direct-image-hybrid-zoom';
}

export interface LogprobRadarTrace {
  decisions: Record<string, LogprobDecision>;
  /** Only fully shortcut-scored criteria, never intermediate probes. */
  fastCriteria: string[];
  totalCriteria: number;
  probes: number;
  unavailable: boolean;
}

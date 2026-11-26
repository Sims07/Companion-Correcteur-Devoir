import { currentFetch } from '../../shared/adapters/ai/currentFetch.ts';
import type { ImageInput } from '../../shared/domain/imageInput.ts';
import { unavailableLogprobDecision, type LogprobTarget, type LogprobPilotRow } from '../domain/visualLogprobDecision.ts';
import { localLogprobEndpoint, probeVisualLogprobs, type LogprobSettings } from '../../shared/adapters/ai/visualLogprobTransport.ts';
export { localLogprobEndpoint, probeVisualLogprobs, type LogprobSettings } from '../../shared/adapters/ai/visualLogprobTransport.ts';

export interface LogprobPilotCase {
  id: string;
  images: readonly ImageInput[];
  context: string;
  gold: Record<string, LogprobPilotRow['expected']>;
}

/** Sequential by design: one model, one independent query per target.
 * Do not silently retry incompatible servers with another API or a different prompt. */
export async function runVisualLogprobPilot(settings: LogprobSettings, cases: readonly LogprobPilotCase[],
  targets: readonly LogprobTarget[], signal: AbortSignal, onRow: (row: LogprobPilotRow) => void,
  fetchImpl: typeof fetch = currentFetch) {
  if (!localLogprobEndpoint(settings)) throw new Error('Profil Responses local non compatible.');
  for (const item of cases) {
    for (const target of targets) {
      signal.throwIfAborted();
      const expected = item.gold[target.key];
      if (!expected) throw new Error('Référence manquante pour ' + target.key);
      const start = performance.now();
      let decision;
      try {
        decision = await probeVisualLogprobs(settings, item.images, target, item.context, signal, fetchImpl);
      } catch {
        signal.throwIfAborted();
        // Do not expose raw server payloads, URL, credential or copied text in reports.
        decision = unavailableLogprobDecision('Réponse réseau ou JSON inexploitable');
      }
      signal.throwIfAborted();
      onRow({ ...decision, caseId: item.id, targetKey: target.key, expected, durationMs: performance.now() - start });
      // A failed transport/capability is a blocking issue, not 94 more requests.
      if (decision.status === 'unavailable') throw new Error('Essai suspendu : ' + decision.reason);
    }
  }
}

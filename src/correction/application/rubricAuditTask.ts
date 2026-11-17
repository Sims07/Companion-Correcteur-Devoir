import { auditRubricWithOllama } from '../adapters/ai/rubricAuditOllama.ts';
import { rubricEvaluationSignature, type Rubric } from '../domain/rubric.ts';
import type { RubricAuditReport, RubricAuditSession } from '../domain/rubricAudit.ts';

/** The task lives outside the rubric panel: navigating to diagnostics must not
 * forget an ongoing Ollama request or enable another identical request. */
export type RubricAuditPhase = 'waiting' | 'validating';
export type RubricAuditTaskState = 'idle' | 'running' | 'success' | 'error' | 'canceled';
export interface RubricAuditTaskSnapshot {
  state: RubricAuditTaskState;
  signature?: string;
  model?: string;
  thinking?: boolean;
  startedAt?: number;
  finishedAt?: number;
  phase?: RubricAuditPhase;
  report?: RubricAuditReport;
  error?: string;
  storageWarning?: string;
}

export const rubricAuditStorageKey = (assignmentId: string) =>
  'companion-correcteur:rubric-audit:v1:' + assignmentId;

const IDLE: RubricAuditTaskSnapshot = { state: 'idle' };
const snapshots = new Map<string, RubricAuditTaskSnapshot>();
const listeners = new Map<string, Set<() => void>>();
const controllers = new Map<string, AbortController>();

export function getRubricAuditTask(assignmentId: string): RubricAuditTaskSnapshot {
  return snapshots.get(assignmentId) ?? IDLE;
}

export function subscribeRubricAuditTask(assignmentId: string, listener: () => void): () => void {
  const set = listeners.get(assignmentId) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(assignmentId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(assignmentId);
  };
}

function publish(assignmentId: string, next: RubricAuditTaskSnapshot) {
  snapshots.set(assignmentId, next);
  listeners.get(assignmentId)?.forEach((listener) => listener());
}

export interface LaunchRubricAudit {
  assignmentId: string;
  rubric: Rubric;
  endpoint: string;
  model: string;
  thinking?: boolean;
}

/** Includes network, response validation and locally persisted results.
 * Cancellation never replaces the last verified audit. */
export async function launchRubricAuditTask(
  { assignmentId, rubric, endpoint, model, thinking = false }: LaunchRubricAudit,
): Promise<void> {
  if (getRubricAuditTask(assignmentId).state === 'running') return;
  const controller = new AbortController();
  controllers.set(assignmentId, controller);
  const signature = rubricEvaluationSignature(rubric);
  const startedAt = Date.now();
  publish(assignmentId, { state: 'running', signature, model, thinking, startedAt, phase: 'waiting' });
  try {
    const report = await auditRubricWithOllama(rubric, {
      endpoint, model, thinking, signal: controller.signal,
      onStage: (phase) => {
        if (controllers.get(assignmentId) === controller && !controller.signal.aborted) {
          publish(assignmentId, { state: 'running', signature, model, thinking, startedAt, phase });
        }
      },
    });
    if (controller.signal.aborted || controllers.get(assignmentId) !== controller) return;
    const session: RubricAuditSession = { report, decisions: [] };
    let storageWarning: string | undefined;
    try {
      window.localStorage.setItem(rubricAuditStorageKey(assignmentId), JSON.stringify(session));
    } catch {
      storageWarning = 'Résultat affiché, mais l’enregistrement local a échoué. Gardez cette page ouverte et vérifiez votre espace de stockage.';
    }
    publish(assignmentId, {
      state: 'success', signature, model, thinking, startedAt, finishedAt: Date.now(),
      report, ...(storageWarning ? { storageWarning } : {}),
    });
  } catch (cause) {
    if (controller.signal.aborted || controllers.get(assignmentId) !== controller) return;
    publish(assignmentId, {
      state: 'error', signature, model, thinking, startedAt, finishedAt: Date.now(),
      error: cause instanceof Error ? cause.message : 'La vérification du barème a échoué.',
    });
  } finally {
    if (controllers.get(assignmentId) === controller) controllers.delete(assignmentId);
  }
}

export function cancelRubricAuditTask(assignmentId: string): void {
  const controller = controllers.get(assignmentId);
  if (!controller) return;
  const previous = getRubricAuditTask(assignmentId);
  controller.abort();
  controllers.delete(assignmentId);
  publish(assignmentId, {
    state: 'canceled', signature: previous.signature, model: previous.model, thinking: previous.thinking,
    startedAt: previous.startedAt, finishedAt: Date.now(),
  });
}

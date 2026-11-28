export const MAX_DIAGRAM_CRITERION_ATTEMPTS = 3;

/** Only retry failures that can plausibly recover without changing grading inputs. */
export function isRetryableDiagramFailure(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  const status = /(?:HTTP|status(?: code)?)\s*[:=]?\s*(\d{3})/i.exec(message)?.[1];
  if (status) {
    const code = Number(status);
    return [408, 425, 429].includes(code) || code >= 500;
  }
  return /failed to fetch|networkerror|load failed|connection reset|socket hang up|temporarily unavailable|délai.*dépass|timeout|json invalide|json tronqu|réponse json|réparation.*échou|inexploitable après la seconde tentative|réponse.*inexploitable/i.test(message);
}

/** Short bounded backoff gives a temporarily busy local inference server time to recover. */
export function diagramRetryDelayMs(nextAttempt: number): number {
  return nextAttempt <= 2 ? 250 : 750;
}

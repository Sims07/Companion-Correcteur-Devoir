export interface SmartZoomRequestDiagnostics {
  used: number;
  budget: number;
  rejected: number;
  rejectionBudget: number;
  phase: 'exploration' | 'budget' | 'rejections' | 'recovery';
}
export interface NetworkRequestMetadata {
  intent: string;
  context?: string;
  responsesExpectsJson?: boolean;
  smartZoom?: SmartZoomRequestDiagnostics;
}
const requestMetadata = new WeakMap<RequestInit, NetworkRequestMetadata>();
/** Attaches local-only observability metadata without adding HTTP headers or changing the payload. */
export function annotateNetworkRequest<T extends RequestInit>(init: T, intent: string, context?: string): T {
  requestMetadata.set(init, { intent: intent.trim() || 'Intention non renseignée', ...(context?.trim() ? { context: context.trim() } : {}) });
  return init;
}
export function getNetworkRequestMetadata(init?: RequestInit | null): NetworkRequestMetadata | undefined {
  return init ? requestMetadata.get(init) : undefined;
}
/** Keeps intent metadata when a transport adapter translates a request to another HTTP endpoint. */
export function copyNetworkRequestMetadata(source: RequestInit | undefined, target: RequestInit, responsesExpectsJson?: boolean, smartZoom?: SmartZoomRequestDiagnostics): RequestInit {
  const metadata = getNetworkRequestMetadata(source);
  if (responsesExpectsJson !== undefined || smartZoom) {
    requestMetadata.set(target, { intent: 'Intention non renseignée', ...metadata, ...(responsesExpectsJson !== undefined ? { responsesExpectsJson } : {}), ...(smartZoom ? { smartZoom } : {}) });
  } else if (metadata) requestMetadata.set(target, metadata);
  return target;
}

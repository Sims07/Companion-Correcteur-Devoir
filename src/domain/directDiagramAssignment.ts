import { validateRubric, type Rubric } from './rubric.ts';

/** Identify loopback URLs for endpoint diagnostics. */
export function isLoopbackDiagramEndpoint(endpoint: string): boolean {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch { return false; }
}

/** Check the diagram assignment and selected model before correction. */
export function directDiagramAssignmentIssue(
  rubric: Rubric,
  configuration: { correctionMethod?: string; analysisModel: string; endpoint: string },
): string | null {
  const validation = validateRubric(rubric);
  if (!validation.valid) return validation.errors.join(' ');
  if (rubric.criteria.some((item) => item.analysisMode !== 'scientific-diagram')) {
    return 'Le barème de ce devoir doit contenir exclusivement des critères de schéma scientifique.';
  }
  if (configuration.correctionMethod !== 'generative') {
    return 'Pour ce devoir, choisissez la méthode classique (générative), avec un modèle de vision.';
  }
  if (!configuration.analysisModel.trim()) return 'Choisissez un modèle génératif capable de lire le schéma.';
  if (!configuration.endpoint.trim()) return 'Configurez une adresse de serveur IA.';
  return null;
}

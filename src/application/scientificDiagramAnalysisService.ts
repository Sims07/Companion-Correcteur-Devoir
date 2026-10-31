import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest, ScientificPageClassificationRequest } from '../ports/scientificDiagramAnalysis.ts';
import type { ScientificPageClassification } from '../domain/scientificPageClassification.ts';

export interface ScientificDiagramAnalysisService {
  classifyPages(request: ScientificPageClassificationRequest): Promise<ScientificPageClassification[]>;
  analyze(request: ScientificDiagramAnalysisRequest): ReturnType<ScientificDiagramAnalyzer['analyze']>;
}

/** Dedicated use case: diagram analysis is opt-in and never part of text grading. */
export function createScientificDiagramAnalysisService(analyzer: ScientificDiagramAnalyzer): ScientificDiagramAnalysisService {
  return {
    classifyPages: (request) => {
      if (!request.images.length) return Promise.reject(new Error('Importez au moins une page avant de lancer la détection.'));
      if (!request.model.trim()) return Promise.reject(new Error('Choisissez un modèle Vision pour détecter les types de page.'));
      if (!request.endpoint.trim()) return Promise.reject(new Error('Configurez un endpoint API compatible OpenAI.'));
      return analyzer.classifyPages(request);
    },
    analyze: (request) => {
    if (!request.images.length) return Promise.reject(new Error('Importez au moins une page de copie avant d’analyser les schémas.'));
    if (!request.model.trim()) return Promise.reject(new Error('Choisissez un modèle Vision pour analyser les schémas scientifiques.'));
    if (!request.endpoint.trim()) return Promise.reject(new Error('Configurez un endpoint API compatible OpenAI.'));
    return analyzer.analyze(request);
    },
  };
}

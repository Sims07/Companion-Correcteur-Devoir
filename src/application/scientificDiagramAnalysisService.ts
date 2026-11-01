import type { ScientificDiagramAnalysis } from '../domain/scientificDiagram.ts';
import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest, ScientificPageClassificationRequest } from '../ports/scientificDiagramAnalysis.ts';
import type { ScientificPageClassification } from '../domain/scientificPageClassification.ts';

export interface ScientificDiagramAnalysisService {
  classifyPages(request: ScientificPageClassificationRequest): Promise<ScientificPageClassification[]>;
  analyze(request: ScientificDiagramAnalysisRequest): Promise<ScientificDiagramAnalysis>;
}

/**
 * Dedicated use case: diagram analysis is opt-in and never part of text grading.
 * A multi-page copy is deliberately processed as repeated individual-page analyses.
 * This keeps every Vision call identical to the single-image correction path.
 */
export function createScientificDiagramAnalysisService(analyzer: ScientificDiagramAnalyzer): ScientificDiagramAnalysisService {
  return {
    classifyPages: (request) => {
      if (!request.images.length) return Promise.reject(new Error('Importez au moins une page avant de lancer la détection.'));
      if (!request.model.trim()) return Promise.reject(new Error('Choisissez un modèle Vision pour détecter les types de page.'));
      if (!request.endpoint.trim()) return Promise.reject(new Error('Configurez un endpoint API compatible OpenAI.'));
      return analyzer.classifyPages(request);
    },
    analyze: async (request) => {
      if (!request.images.length) throw new Error('Importez au moins une page de copie avant d’analyser les schémas.');
      if (!request.model.trim()) throw new Error('Choisissez un modèle Vision pour analyser les schémas scientifiques.');
      if (!request.endpoint.trim()) throw new Error('Configurez un endpoint API compatible OpenAI.');

      if (request.images.length === 1) {
        return analyzer.analyze({
          ...request,
          images: [request.images[0]],
          pageNumbers: [request.pageNumbers?.[0] ?? 1],
        });
      }

      const diagrams: ScientificDiagramAnalysis['diagrams'] = [];
      const overallUncertainties: string[] = [];
      const warnings: string[] = [];

      // Do not send multiple images in one Vision message. Reuse the exact individual
      // analysis path, one page at a time, and preserve the original copy page number.
      for (const [index, image] of request.images.entries()) {
        const originalPageNumber = request.pageNumbers?.[index] ?? index + 1;
        const pageResult = await analyzer.analyze({
          ...request,
          images: [image],
          pageNumbers: [originalPageNumber],
        });
        const idMap = new Map<string, string>();
        const pageDiagrams: ScientificDiagramAnalysis['diagrams'] = [];
        for (const diagram of pageResult.diagrams) {
          const id = 'diagram-' + (diagrams.length + pageDiagrams.length + 1);
          idMap.set(diagram.id, id);
          pageDiagrams.push({ ...diagram, id, pageNumber: originalPageNumber, criteria: [] });
        }
        diagrams.push(...pageDiagrams);

        const pageCriteria = pageResult.criteria ?? pageResult.diagrams.flatMap((diagram) => diagram.criteria ?? []);
        // Store one assessment per page (not one per drawing). The existing rubric merge
        // averages page-level assessments and flags them for teacher review rather than
        // inventing a score by summing independent page grades.
        if (pageDiagrams.length > 0 && pageCriteria.length > 0) {
          const firstDiagramForPage = pageDiagrams[0];
          if (firstDiagramForPage) {
            firstDiagramForPage.criteria = pageCriteria.map((criterion) => ({
              ...criterion,
              diagramIds: (criterion.diagramIds ?? []).map((id) => idMap.get(id)).filter((id): id is string => id !== undefined),
            }));
          }
        }
        overallUncertainties.push(...pageResult.overallUncertainties);
        warnings.push(...(pageResult.warnings ?? []));
      }

      return {
        diagrams,
        overallUncertainties: [...new Set(overallUncertainties)],
        warnings: [...new Set([...warnings, 'Évaluations page par page : la moyenne des notes constitue une proposition à vérifier par l’enseignant.'])],
      };
    },
  };
}

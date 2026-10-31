export type ScientificPageKind = 'text' | 'scientific-diagram' | 'mixed' | 'ambiguous';

export interface ScientificPageClassification {
  pageNumber: number;
  kind: ScientificPageKind;
  confidence: number;
  reason: string;
  /** Clockwise correction required to make a confidently detected scientific diagram upright. */
  suggestedRotation?: 0 | 90 | 180 | 270;
  /** Confidence in the orientation decision, independent from page-kind confidence. */
  orientationConfidence?: number;
}

/** Validate page routing decisions before they influence the correction pipeline. */
export function parseScientificPageClassifications(raw: string, pageCount: number): ScientificPageClassification[] {
  const cleaned = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error('La classification Vision des pages n’est pas un JSON valide.'); }
  if (typeof parsed !== 'object' || parsed === null || !('pages' in parsed) || !Array.isArray(parsed.pages)) {
    throw new Error('La réponse Vision ne respecte pas le contrat de classification des pages.');
  }
  if (parsed.pages.length !== pageCount) throw new Error('La classification Vision doit couvrir exactement toutes les pages de la copie.');
  const seen = new Set<number>();
  const pages = parsed.pages.map((item): ScientificPageClassification => {
    if (typeof item !== 'object' || item === null) throw new Error('Une classification de page est invalide.');
    const value = item as Record<string, unknown>;
    const pageNumber = value.pageNumber;
    if (!Number.isInteger(pageNumber) || Number(pageNumber) < 1 || Number(pageNumber) > pageCount || seen.has(Number(pageNumber))) {
      throw new Error('La classification contient un numéro de page invalide ou répété.');
    }
    if (value.kind !== 'text' && value.kind !== 'scientific-diagram' && value.kind !== 'mixed' && value.kind !== 'ambiguous') {
      throw new Error(`Le type de page ${String(pageNumber)} n’est pas reconnu.`);
    }
    if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 || typeof value.reason !== 'string') {
      throw new Error(`Les éléments de classification de la page ${String(pageNumber)} sont invalides.`);
    }
    const suggestedRotation = value.suggestedRotation;
    const orientationConfidence = value.orientationConfidence;
    if (suggestedRotation !== undefined && suggestedRotation !== 0 && suggestedRotation !== 90 && suggestedRotation !== 180 && suggestedRotation !== 270) throw new Error(`L’orientation proposée pour la page ${String(pageNumber)} est invalide.`);
    if (orientationConfidence !== undefined && (typeof orientationConfidence !== 'number' || !Number.isFinite(orientationConfidence) || orientationConfidence < 0 || orientationConfidence > 1)) throw new Error(`La confiance d’orientation de la page ${String(pageNumber)} est invalide.`);
    if ((suggestedRotation === undefined) !== (orientationConfidence === undefined)) throw new Error(`La décision d’orientation de la page ${String(pageNumber)} est incomplète.`);
    seen.add(Number(pageNumber));
    const confidence = value.confidence;
    const kind = (value.kind === 'scientific-diagram' || value.kind === 'mixed') && confidence < 0.75 ? 'ambiguous' : value.kind;
    return { pageNumber: Number(pageNumber), kind, confidence, reason: value.reason, ...(suggestedRotation !== undefined && orientationConfidence !== undefined ? { suggestedRotation, orientationConfidence } : {}) };
  });
  return pages.sort((left, right) => left.pageNumber - right.pageNumber);
}

export interface ScientificPageRouting {
  textPageNumbers: number[];
  diagramPageNumbers: number[];
  ambiguousPageNumbers: number[];
}

/** Keep uncertain pages in the text workflow; route only confident diagram pages separately. */
export function routeScientificPages(classifications: ScientificPageClassification[], pageCount: number): ScientificPageRouting {
  if (classifications.length !== pageCount) throw new Error('La classification ne correspond pas au nombre de pages de la copie.');
  const byPage = new Map(classifications.map((page) => [page.pageNumber, page]));
  if (byPage.size !== pageCount || Array.from({ length: pageCount }, (_, index) => index + 1).some((page) => !byPage.has(page))) {
    throw new Error('La classification ne couvre pas exactement les pages de la copie.');
  }
  return {
    textPageNumbers: classifications.filter((page) => page.kind === 'text' || page.kind === 'mixed' || page.kind === 'ambiguous').map((page) => page.pageNumber),
    diagramPageNumbers: classifications.filter((page) => page.kind === 'scientific-diagram' || page.kind === 'mixed').map((page) => page.pageNumber),
    ambiguousPageNumbers: classifications.filter((page) => page.kind === 'ambiguous').map((page) => page.pageNumber),
  };
}

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

/** Extract one complete JSON object from common local-model wrappers without relaxing schema validation. */
function extractModelJsonObject(raw: string): string {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThinking.replace(/^\u0060{3}(?:json)?\s*/i, '').replace(/\s*\u0060{3}$/, '');
  const start = fenced.indexOf('{');
  if (start < 0) return fenced;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < fenced.length; index += 1) {
    const character = fenced[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character.charCodeAt(0) === 92) escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return fenced.slice(start, index + 1);
    }
  }
  return fenced;
}

/** Validate page routing decisions before they influence the correction pipeline. */
export function parseScientificPageClassifications(raw: string, pageCount: number): ScientificPageClassification[] {
  const cleaned = extractModelJsonObject(raw);
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
    const rawRotation = value.suggestedRotation;
    const rawOrientationConfidence = value.orientationConfidence;
    const normalizedRotation = rawRotation === -90 ? 270 : rawRotation;
    const validRotation = normalizedRotation === 0 || normalizedRotation === 90 || normalizedRotation === 180 || normalizedRotation === 270;
    const validOrientationConfidence = typeof rawOrientationConfidence === 'number'
      && Number.isFinite(rawOrientationConfidence)
      && rawOrientationConfidence >= 0
      && rawOrientationConfidence <= 1;
    // Orientation is optional metadata: malformed or partial model output must not
    // invalidate an otherwise usable page classification.
    const hasValidOrientation = validRotation && validOrientationConfidence;
    seen.add(Number(pageNumber));
    const confidence = value.confidence;
    const kind = (value.kind === 'scientific-diagram' || value.kind === 'mixed') && confidence < 0.75 ? 'ambiguous' : value.kind;
    return { pageNumber: Number(pageNumber), kind, confidence, reason: value.reason, ...(hasValidOrientation ? { suggestedRotation: normalizedRotation as 0 | 90 | 180 | 270, orientationConfidence: rawOrientationConfidence as number } : {}) };
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

import { parseModelJson } from './modelJson.ts';

export type ScientificPageKind = 'text' | 'scientific-diagram' | 'mixed' | 'ambiguous';
export interface ScientificPageClassification {
  pageNumber: number; kind: ScientificPageKind; confidence: number; reason: string;
  suggestedRotation?: 0 | 90 | 180 | 270; orientationConfidence?: number; warning?: string;
}
function extractModelJson(raw: string): string {
  const source = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '');
  const start = source.search(/[\{\[]/);
  if (start < 0) throw new Error('La réponse Vision ne contient aucun objet JSON.');
  const opening = source[start], closing = opening === '{' ? '}' : ']';
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true; else if (c === opening) depth += 1; else if (c === closing) { depth -= 1; if (!depth) return source.slice(start, i + 1); }
  }
  throw new Error('La réponse Vision est tronquée : objet JSON incomplet.');
}
function normalizeKind(value: unknown): ScientificPageKind | null {
  if (typeof value !== 'string') return null;
  const kind = value.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ _]/g, '-');
  if (['text', 'texte', 'textuel'].includes(kind)) return 'text';
  if (['scientific-diagram', 'scientificdiagram', 'diagram', 'diagramme', 'schema'].includes(kind)) return 'scientific-diagram';
  if (['mixed', 'mixte'].includes(kind)) return 'mixed';
  if (['ambiguous', 'ambigu', 'incertain', 'unknown'].includes(kind)) return 'ambiguous';
  return null;
}
function confidenceValue(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : Number.NaN;
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : 0.5;
}
export function parseScientificPageClassifications(raw: string, pageCount: number): ScientificPageClassification[] {
  let parsed: unknown;
  try { parsed = JSON.parse(extractModelJson(raw)); }
  catch (cause) { if (cause instanceof Error && /tronquée|aucun objet JSON/.test(cause.message)) throw cause; throw new Error('La classification Vision des pages n’est pas un JSON valide.'); }
  if (Array.isArray(parsed)) throw new Error('La classification Vision doit être un objet JSON, pas un tableau racine.');
  if (!parsed || typeof parsed !== 'object') throw new Error('La réponse Vision ne respecte pas le contrat de classification des pages.');
  const root = parsed as Record<string, unknown>;
  const entries = Array.isArray(root.pages) ? root.pages : pageCount === 1 && ('kind' in root || 'type' in root || 'typePage' in root || 'type_page' in root) ? [root] : null;
  if (!entries) throw new Error('La réponse Vision doit contenir pages ou un objet de classification pour une page unique.');
  if (entries.length !== pageCount) throw new Error('La classification Vision doit couvrir exactement toutes les pages de la copie.');
  const seen = new Set<number>();
  const pages = entries.map((item, index): ScientificPageClassification => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`La classification de la page ${index + 1} doit être un objet JSON.`);
    const value = item as Record<string, unknown>;
    const rawPage = value.pageNumber ?? value.numeroPage ?? value.page ?? index + 1;
    const pageNumber = typeof rawPage === 'string' && rawPage.trim() ? Number(rawPage) : rawPage;
    if (!Number.isInteger(pageNumber) || Number(pageNumber) < 1 || Number(pageNumber) > pageCount || seen.has(Number(pageNumber))) throw new Error('La classification contient un numéro de page invalide ou répété.');
    const rawKind = value.kind ?? value.typePage ?? value.type_page ?? value.type ?? value.nature;
    const normalized = normalizeKind(rawKind);
    const confidence = confidenceValue(value.confidence ?? value.confiance);
    const warning = normalized === null
      ? `Page ${pageNumber} : type de page inconnu (« ${String(rawKind ?? 'absent')} »), classée comme ambiguë. Vérification enseignante nécessaire.`
      : confidence < 0.75 && (normalized === 'scientific-diagram' || normalized === 'mixed' || normalized === 'ambiguous')
        ? `Page ${pageNumber} : schéma possible, confiance faible.`
        : undefined;
    const rawReason = value.reason ?? value.raison ?? value.justification ?? value.motif;
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
    const rawRotation = value.suggestedRotation ?? value.rotationSuggeree ?? value.rotation;
    const rotation = typeof rawRotation === 'string' && rawRotation.trim() ? Number(rawRotation) : rawRotation;
    const normalizedRotation = rotation === -90 ? 270 : rotation;
    const validRotation = [0, 90, 180, 270].includes(normalizedRotation as number);
    const rawOrientation = value.orientationConfidence ?? value.confianceOrientation;
    const orientationConfidence = typeof rawOrientation === 'string' && rawOrientation.trim() ? Number(rawOrientation.replace(',', '.')) : rawOrientation;
    const validOrientation = typeof orientationConfidence === 'number' && Number.isFinite(orientationConfidence) && orientationConfidence >= 0 && orientationConfidence <= 1;
    seen.add(Number(pageNumber));
    const kind = normalized === null ? 'ambiguous' : (normalized === 'scientific-diagram' || normalized === 'mixed') && confidence < 0.75 ? 'ambiguous' : normalized;
    return { pageNumber: Number(pageNumber), kind, confidence, reason, ...(validRotation && validOrientation ? { suggestedRotation: normalizedRotation as 0 | 90 | 180 | 270, orientationConfidence } : {}), ...(warning ? { warning } : {}) };
  });
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}
export interface ScientificPageRouting { textPageNumbers: number[]; diagramPageNumbers: number[]; ambiguousPageNumbers: number[]; }
export function routeScientificPages(classifications: ScientificPageClassification[], pageCount: number): ScientificPageRouting {
  if (classifications.length !== pageCount) throw new Error('La classification ne correspond pas au nombre de pages de la copie.');
  const byPage = new Map(classifications.map((page) => [page.pageNumber, page]));
  if (byPage.size !== pageCount || Array.from({ length: pageCount }, (_, index) => index + 1).some((page) => !byPage.has(page))) throw new Error('La classification ne couvre pas exactement les pages de la copie.');
  return {
    textPageNumbers: classifications.filter((page) => page.kind === 'text' || page.kind === 'mixed' || page.kind === 'ambiguous').map((page) => page.pageNumber),
    diagramPageNumbers: classifications.filter((page) => page.kind === 'scientific-diagram' || page.kind === 'mixed').map((page) => page.pageNumber),
    ambiguousPageNumbers: classifications.filter((page) => page.kind === 'ambiguous').map((page) => page.pageNumber),
  };
}

/** Applies an explicit teacher decision to an ambiguous page before routing it again. */
export function resolveAmbiguousPageClassification(
  classifications: ScientificPageClassification[],
  pageNumber: number,
  kind: 'text' | 'scientific-diagram',
): ScientificPageClassification[] {
  let found = false;
  const updated = classifications.map((page) => {
    if (page.pageNumber !== pageNumber) return page;
    if (page.kind !== 'ambiguous') throw new Error('Seules les pages ambiguës peuvent être arbitrées manuellement.');
    found = true;
    return {
      ...page,
      kind,
      confidence: 1,
      reason: kind === 'scientific-diagram' ? 'Schéma confirmé par l’enseignant.' : 'Page ignorée comme schéma par l’enseignant.',
      warning: undefined,
    };
  });
  if (!found) throw new Error('La page ambiguë à arbitrer est introuvable.');
  return updated;
}

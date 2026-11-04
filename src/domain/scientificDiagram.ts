import { getRubricSubcriteria, type Rubric, type RubricSubcriterion } from './rubric.ts';

export interface DiagramCriterionAssessment {
  criterionId: string;
  title: string;
  points: number;
  maxPoints: number;
  evidence: string;
  confidence: number;
  requiresTeacherReview: boolean;
  diagramIds?: string[];
  elements?: Array<{ subcriterionId: string; label: string; status: 'present' | 'partial' | 'absent' | 'uncertain'; evidence: string; points: number; maxPoints: number }>;
}

export interface ScientificDiagramFinding {
  id: string;
  pageNumber: number;
  bounds?: { x: number; y: number; width: number; height: number };
  diagramType: string;
  summary: string;
  criteria: DiagramCriterionAssessment[];
  uncertainties: string[];
}

export interface ScientificDiagramAnalysis {
  diagrams: ScientificDiagramFinding[];
  criteria?: DiagramCriterionAssessment[];
  overallUncertainties: string[];
  warnings?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

type DiagramRow = {
  source: Record<string, unknown>;
  id: string;
  pageNumber: number;
  diagramType: string;
  summary: string;
  bounds?: ScientificDiagramFinding['bounds'];
  uncertainties: string[];
};

function normalizeStrings(value: unknown): string[] {
  if (value == null || value === '') return [];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeDiagrams(
  values: unknown[],
  pageCount: number,
  allowedPageNumbers: number[],
  warnings: string[],
): DiagramRow[] {
  const rows: DiagramRow[] = [];
  values.forEach((value, index) => {
    if (!isRecord(value)) {
      warnings.push('Schéma ' + (index + 1) + ' ignoré : objet invalide.');
      return;
    }

    const localPage = value.pageNumber;
    if (!Number.isInteger(localPage) || Number(localPage) < 1 || Number(localPage) > pageCount || allowedPageNumbers[Number(localPage) - 1] === undefined) {
      throw new Error('Champ pageNumber invalide pour le schéma ' + (index + 1) + '.');
    }

    let bounds: ScientificDiagramFinding['bounds'];
    if (isRecord(value.bounds)) {
      const candidate = value.bounds;
      const validNumbers = [candidate.x, candidate.y, candidate.width, candidate.height]
        .every((number) => typeof number === 'number' && Number.isFinite(number));
      const validPosition = Number(candidate.x) >= 0 && Number(candidate.y) >= 0;
      const validSize = Number(candidate.width) > 0 && Number(candidate.height) > 0;
      const withinPage = Number(candidate.x) + Number(candidate.width) <= 1 && Number(candidate.y) + Number(candidate.height) <= 1;
      if (validNumbers && validPosition && validSize && withinPage) {
        bounds = { x: Number(candidate.x), y: Number(candidate.y), width: Number(candidate.width), height: Number(candidate.height) };
      } else {
        warnings.push('Bounds invalides supprimés pour le schéma ' + (index + 1) + '.');
      }
    } else if (value.bounds != null) {
      warnings.push('Bounds invalides supprimés pour le schéma ' + (index + 1) + '.');
    }

    rows.push({
      source: value,
      id: 'diagram-' + (index + 1),
      pageNumber: allowedPageNumbers[Number(localPage) - 1],
      diagramType: typeof value.diagramType === 'string' ? value.diagramType : 'schéma',
      summary: typeof value.summary === 'string' ? value.summary : '',
      ...(bounds ? { bounds } : {}),
      uncertainties: normalizeStrings(value.uncertainties),
    });
  });
  if (rows.length === 0) throw new Error('Aucun schéma exploitable dans le champ diagrams.');
  return rows;
}

function normalizeCriterionCollection(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  return Object.entries(value).map(([criterionId, item]) => ({
    ...(isRecord(item) ? item : {}),
    criterionId: isRecord(item) && typeof item.criterionId === 'string' ? item.criterionId : criterionId,
  }));
}

function normalizeElementLabel(label: string): string {
  return label.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function computeElementPoints(
  configured: RubricSubcriterion[],
  returned: unknown[],
  warnings: string[],
): NonNullable<DiagramCriterionAssessment['elements']> {
  const candidates = returned.filter(isRecord);
  const used = new Set<Record<string, unknown>>();

  return configured.map((element) => {
    const found = candidates.find((candidate) =>
      !used.has(candidate) && candidate.subcriterionId === element.id,
    ) ?? candidates.find((candidate) =>
      !used.has(candidate) &&
      typeof candidate.label === 'string' &&
      normalizeElementLabel(candidate.label) === normalizeElementLabel(element.title),
    );
    if (found) used.add(found);

    const returnedStatus = found?.status === 'partially-fulfilled' ? 'partial' : found?.status;
    const validStatus = ['present', 'partial', 'absent', 'uncertain'].includes(String(returnedStatus));
    const status = validStatus
      ? returnedStatus as 'present' | 'partial' | 'absent' | 'uncertain'
      : 'uncertain';
    const suppliedPoints = found?.points;
    const pointsAreValid = typeof suppliedPoints === 'number'
      && Number.isFinite(suppliedPoints)
      && suppliedPoints >= 0
      && suppliedPoints <= element.maxPoints;
    const statusMatchesPoints = pointsAreValid
      && (status === 'absent' ? suppliedPoints === 0 : status === 'present' ? suppliedPoints > 0 : true);

    if (!found) {
      warnings.push('Sous-critère « ' + element.title + ' » absent de la réponse Vision ; aucune note ne peut être déduite.');
    } else if (!pointsAreValid) {
      warnings.push('Points absents ou hors limites pour le sous-critère « ' + element.title + ' » ; aucune note ne peut être déduite.');
    } else if (!statusMatchesPoints) {
      warnings.push('Points incohérents avec le statut « ' + status + ' » pour le sous-critère « ' + element.title + ' » ; aucune note ne peut être déduite.');
    } else if (!validStatus) {
      warnings.push('Statut invalide pour le sous-critère « ' + element.title + ' » ; vérification enseignante requise.');
    }

    const validAssessment = Boolean(found && validStatus && statusMatchesPoints);
    const evidence = validAssessment && typeof found?.evidence === 'string' && found.evidence.trim()
      ? found.evidence.trim()
      : 'Preuve non fournie par le modèle';

    return {
      subcriterionId: element.id,
      label: element.title,
      status,
      evidence,
      maxPoints: element.maxPoints,
      points: validAssessment ? suppliedPoints as number : 0,
    };
  });
}

function assessCriterion(
  value: unknown,
  rubric: Rubric,
  rows: DiagramRow[],
  warnings: string[],
  legacyDiagramId?: string,
): DiagramCriterionAssessment | null {
  if (!isRecord(value) || typeof value.criterionId !== 'string' || !value.criterionId.trim()) {
    warnings.push('Élément parasite dans criteria ignoré (criterionId absent ou invalide).');
    return null;
  }

  const criterion = rubric.criteria.find((item) => item.id === value.criterionId);
  if (!criterion) throw new Error('Champ criterionId inconnu : ' + value.criterionId + '.');

  const configuredElements = legacyDiagramId ? [] : getRubricSubcriteria(criterion);
  const returnedElements = Array.isArray(value.elements) ? value.elements : [];
  const warningsBeforeElements = warnings.length;
  const elements = configuredElements.length > 0
    ? computeElementPoints(configuredElements, returnedElements, warnings)
    : undefined;
  const hasElementWarnings = warnings.length > warningsBeforeElements;
  const points = elements
    ? elements.reduce((sum, element) => sum + element.points, 0)
    : typeof value.points === 'number' ? value.points : Number.NaN;
  if (!Number.isFinite(points) || points < 0 || points > criterion.maxPoints) {
    throw new Error('Champ points hors barème pour « ' + criterion.title + ' ».');
  }
  const criterionScoreMismatch = Boolean(elements)
    && typeof value.points === 'number'
    && Number.isFinite(value.points)
    && Math.abs(value.points - points) > 0.0001;
  if (criterionScoreMismatch) {
    warnings.push('La somme des sous-critères ne correspond pas à la note annoncée pour le critère « ' + criterion.title + ' ».');
  }

  const evidence = typeof value.evidence === 'string' && value.evidence.trim()
    ? value.evidence.trim()
    : 'Preuve non fournie par le modèle';
  const confidence = typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1
    ? value.confidence
    : 0;
  let requiresTeacherReview = typeof value.requiresTeacherReview === 'boolean' ? value.requiresTeacherReview : true;
  if (evidence === 'Preuve non fournie par le modèle' || hasElementWarnings || criterionScoreMismatch) requiresTeacherReview = true;

  if (elements?.some((element) => ['partial', 'absent', 'uncertain'].includes(element.status))) requiresTeacherReview = true;
  if (elements?.some((element) => element.evidence === 'Preuve non fournie par le modèle')) requiresTeacherReview = true;
  if (elements && points < criterion.maxPoints * 0.3 && elements.every((element) => ['present', 'partial'].includes(element.status))) {
    requiresTeacherReview = true;
  }

  const returnedIds = Array.isArray(value.diagramIds)
    ? value.diagramIds.filter((id): id is string => typeof id === 'string')
    : [];
  const diagramIds = returnedIds.length > 0
    ? returnedIds
      .map((id) => rows.find((row) => row.id === id || row.source.id === id)?.id)
      .filter((id): id is string => id !== undefined)
    : legacyDiagramId ? [legacyDiagramId] : rows.map((row) => row.id);

  return {
    criterionId: criterion.id,
    title: criterion.title,
    points,
    maxPoints: criterion.maxPoints,
    evidence,
    confidence,
    requiresTeacherReview,
    diagramIds,
    ...(elements ? { elements } : {}),
  };
}

/** Tolerant on explanatory fields, strict on rubric ids, scores and page references. */
export function parseScientificDiagramAnalysis(
  raw: string,
  rubric: Rubric,
  pageCount: number,
  allowedPageNumbers: number[] = Array.from({ length: pageCount }, (_, index) => index + 1),
): ScientificDiagramAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractModelJsonObject(raw));
  } catch {
    throw new Error('La réponse du modèle Vision n’est pas un JSON valide (champ : JSON).');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.diagrams)) {
    throw new Error('La réponse Vision ne contient pas la liste obligatoire "diagrams" (champ : diagrams).');
  }

  const warnings: string[] = [];
  const rows = normalizeDiagrams(parsed.diagrams, pageCount, allowedPageNumbers, warnings);
  const diagrams: ScientificDiagramFinding[] = rows.map((row) => ({
    id: row.id,
    pageNumber: row.pageNumber,
    ...(row.bounds ? { bounds: row.bounds } : {}),
    diagramType: row.diagramType,
    summary: row.summary,
    criteria: [],
    uncertainties: row.uncertainties,
  }));

  const globalCriteria = normalizeCriterionCollection(parsed.criteria);
  if (globalCriteria) {
    const criteria = globalCriteria
      .map((item) => assessCriterion(item, rubric, rows, warnings))
      .filter((item): item is DiagramCriterionAssessment => item !== null);
    return { diagrams, criteria, overallUncertainties: normalizeStrings(parsed.overallUncertainties), warnings };
  }

  const legacyCriteria: DiagramCriterionAssessment[] = [];
  for (const row of rows) {
    for (const item of normalizeCriterionCollection(row.source.criteria) ?? []) {
      const assessment = assessCriterion(item, rubric, rows, warnings, row.id);
      if (assessment) legacyCriteria.push(assessment);
    }
  }
  warnings.push('Ancien format d’analyse par schéma : vérifier la note.');
  const legacyDiagrams = diagrams.map((diagram) => ({
    ...diagram,
    criteria: legacyCriteria.filter((item) => (item.diagramIds ?? []).includes(diagram.id)),
  }));
  return {
    diagrams: legacyDiagrams,
    criteria: legacyCriteria,
    overallUncertainties: normalizeStrings(parsed.overallUncertainties),
    warnings,
  };
}

/** Failed manual fallbacks are displayable but never reusable as a completed Vision analysis. */
export function shouldRunScientificDiagramAnalysis(analysis: ScientificDiagramAnalysis | null): boolean {
  return analysis === null || (analysis.warnings ?? []).some((warning) => warning.startsWith('Analyse des schémas indisponible :'));
}

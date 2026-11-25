import { parseModelJson } from '../../../shared/domain/modelJson.ts';
import { parseGradingProposal } from '../../domain/grading.ts';
import { getRubricSubcriteria, type RubricCriterion } from '../../domain/rubric.ts';
import { sumGradeScores } from '../../../shared/domain/scorePrecision.ts';
import { evaluateObservableScore, isTitleEmphasisRequirement } from '../../domain/observableScoring.ts';

const object = (properties: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
});

/** Named properties remove the anyOf-array ambiguity (duplicate/missing rubric IDs).
 * Only leaf scores are generated; arithmetic belongs to the application. */
export function directDiagramSchema(criteria: RubricCriterion[]) {
  return object({ criteria: object(Object.fromEntries(criteria.map(c => {
    const subs = getRubricSubcriteria(c);
    return [c.id, object({
      evidence: { type: 'string' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      questionForTeacher: { type: 'string' },
      ...(subs.length ? { subcriteria: object(Object.fromEntries(subs.map(s => [s.id, object({
        points: { type: 'number', minimum: 0, maximum: s.maxPoints }, evidence: { type: 'string' },
        ...(isTitleEmphasisRequirement(s.title) ? { observations: object({ underlined: { type: 'boolean' }, framed: { type: 'boolean' }, uppercase: { type: 'boolean' } }) } : {}),
      })]))) } : { points: { type: 'number', minimum: Math.min(0, c.maxPoints), maximum: Math.max(0, c.maxPoints) } }),
    })];
  }))) });
}

/** Reserve room for every scientific observation and its evidence without
 * changing the general OCR budget. 19 rubric leaves now receive 5120 tokens.
 * Constrain the ceiling on small local machines; a longer response can cost time
 * and memory, and the validator must still reject unfinished JSON. */
export function directDiagramGenerationTokenLimit(criteria: RubricCriterion[], thinking = false): number {
  const scoredLeaves = criteria.reduce(
    (total, criterion) => total + Math.max(1, getRubricSubcriteria(criterion).length), 0,
  );
  // A short rubric needs 2048 tokens. The 19-leaf scientific reference was
  // regularly hitting the previous 3072-token ceiling after adding criteria.
  const estimated = 2048 + Math.max(0, scoredLeaves - 8) * 256;
  const withoutThinking = Math.min(6144, Math.ceil(estimated / 512) * 512);
  // Thinking can consume the same output budget before writing any JSON.
  // Think OFF remains the recommended direct-image correction configuration.
  return thinking ? Math.min(6144, Math.max(4096, withoutThinking + 1024)) : withoutThinking;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string): never { throw new Error(`Sortie schéma invalide [diagram-output:${code}].`); }

function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!record(value)) fail('invalid-shape');
  if (keys.some(k => !Object.hasOwn(value, k))) fail('missing-id');
  if (Object.keys(value).some(k => !keys.includes(k))) fail('unknown-id');
}

function evidence(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) fail('missing-evidence');
  return value.trim();
}

function points(value: unknown, maximum: number, path: string): number {
  const minimum = Math.min(0, maximum);
  const upper = Math.max(0, maximum);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > upper) {
    // A precise validation error makes the one permitted repair attempt actionable.
    // Never clamp, coerce or infer a scientific mark.
    const received = typeof value === 'number' && Number.isFinite(value)
      ? String(value) : value === null ? 'null' : typeof value;
    throw new Error(`Sortie schéma invalide [diagram-output:invalid-points] : ${path} attend un nombre entre ${minimum} et ${upper} (reçu : ${received}).`);
  }
  return value;
}


/** When exactly one value is outside its barème, offer the model a narrowly
 * scoped second pass instead of requesting 19 fresh grades. This never
 * interprets the model's original 1 as a valid 0.33 without confirmation. */
export interface DirectDiagramPointRepair {
  criterionId: string;
  criterionTitle: string;
  subcriterionId?: string;
  subcriterionTitle: string;
  maximum: number;
  rubricContext: string;
  originalValue: unknown;
  originalEvidence: string;
}

export function findInvalidDiagramPoints(
  raw: string, criteria: RubricCriterion[],
): DirectDiagramPointRepair[] | null {
  let parsed: unknown;
  try { parsed = parseModelJson(raw); } catch { return null; }
  if (!record(parsed) || !record(parsed.criteria)) return null;
  const invalid: DirectDiagramPointRepair[] = [];
  for (const criterion of criteria) {
    const item = parsed.criteria[criterion.id];
    if (!record(item)) return null;
    const subcriteria = getRubricSubcriteria(criterion);
    if (subcriteria.length && !record(item.subcriteria)) return null;
    for (const sub of subcriteria.length ? subcriteria : [undefined]) {
      const value = sub ? (item.subcriteria as Record<string, unknown>)[sub.id] : item;
      if (!record(value)) return null;
      const maximum = sub?.maxPoints ?? criterion.maxPoints;
      const grade = value.points;
      if (typeof grade !== 'number' || !Number.isFinite(grade)
        || grade < Math.min(0, maximum) || grade > Math.max(0, maximum)) {
        invalid.push({
          criterionId: criterion.id,
          criterionTitle: criterion.title,
          ...(sub ? { subcriterionId: sub.id } : {}),
          subcriterionTitle: sub?.title ?? criterion.title,
          maximum,
          rubricContext: JSON.stringify({
            description: criterion.description,
            scientificExpectations: criterion.scientificExpectations,
            correctionContract: criterion.correctionContract,
            ...(sub ? { subcriterion: { description: sub.description, scientificExpectations: sub.scientificExpectations } } : {}),
          }),
          originalValue: grade,
          originalEvidence: typeof value.evidence === 'string' ? value.evidence : '',
        });
      }
    }
  }
  if (!invalid.length) return null;
  // A targeted repair is safe only if all other fields already form a valid
  // complete grading response. Do not hide unrelated schema failures.
  try {
    const provisional = structuredClone(parsed) as Record<string, unknown>;
    const provisionalCriteria = provisional.criteria as Record<string, Record<string, unknown>>;
    for (const issue of invalid) {
      const criterion = provisionalCriteria[issue.criterionId];
      const leaf = issue.subcriterionId
        ? (criterion.subcriteria as Record<string, Record<string, unknown>>)[issue.subcriterionId]
        : criterion;
      leaf.points = 0; // Validation only; never used as the actual student's score.
    }
    parseDirectDiagramOutput(JSON.stringify(provisional), criteria);
  } catch { return null; }
  return invalid;
}

export function findSingleInvalidDiagramPoint(
  raw: string, criteria: RubricCriterion[],
): DirectDiagramPointRepair | null {
  const issues = findInvalidDiagramPoints(raw, criteria);
  return issues?.length === 1 ? issues[0]! : null;
}

/** Safe diagnostic markers encode only rubric IDs, finite point values and
 * simple types. No model response, evidence, prompt or student data. */
export function diagramInvalidPointMarkers(issues: DirectDiagramPointRepair[]): string {
  return issues.slice(0, 20).flatMap(issue => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(issue.criterionId)
      || (issue.subcriterionId && !/^[a-zA-Z0-9_-]{1,64}$/.test(issue.subcriterionId))
      || !Number.isFinite(issue.maximum) || issue.maximum < 0 || issue.maximum > 10000) return [];
    const value = issue.originalValue;
    const received = typeof value === 'number'
      ? Number.isFinite(value) && Math.abs(value) <= 1000000 ? String(value) : 'out-of-range'
      : value === null ? 'null' : typeof value;
    return [`[diagram-point:${issue.criterionId}/${issue.subcriterionId ?? '-'}:${issue.maximum}:${received}]`];
  }).join(' ');
}

/** Multiple invalid marks are repaired in one narrowly scoped model call.
 * The remaining valid marks and their evidence cannot be rewritten. */
export function directDiagramPointsRepairSchema(issues: DirectDiagramPointRepair[]) {
  return object({ corrections: object(Object.fromEntries(issues.map((issue, index) => [
    'item' + (index + 1), object({
      points: { type: 'number', minimum: 0, maximum: issue.maximum },
      evidence: { type: 'string' },
    }),
  ]))) });
}

export function applyDirectDiagramPointsRepair(
  originalRaw: string, repairRaw: string, issues: DirectDiagramPointRepair[],
  criteria: RubricCriterion[],
): string {
  if (issues.length < 2) fail('invalid-shape');
  let initial: unknown, corrected: unknown;
  try {
    initial = parseModelJson(originalRaw);
    corrected = parseModelJson(repairRaw);
  } catch { fail('invalid-json'); }
  if (!record(initial) || !record(initial.criteria) || !record(corrected)) fail('invalid-shape');
  exactKeys(corrected, ['corrections']);
  exactKeys(corrected.corrections, issues.map((_, index) => 'item' + (index + 1)));
  const values = corrected.corrections;
  const originalCriteria = initial.criteria;
  for (const [index, issue] of issues.entries()) {
    const value = values['item' + (index + 1)];
    exactKeys(value, ['points', 'evidence']);
    const location = issue.criterionId + (issue.subcriterionId ? '.subcriteria.' + issue.subcriterionId : '') + '.points';
    const revisedPoints = points(value.points, issue.maximum, location);
    const revisedEvidence = evidence(value.evidence);
    const criterion = originalCriteria[issue.criterionId];
    if (!record(criterion)) fail('invalid-shape');
    const leaf = issue.subcriterionId
      ? record(criterion.subcriteria) ? criterion.subcriteria[issue.subcriterionId] : null
      : criterion;
    if (!record(leaf)) fail('invalid-shape');
    leaf.points = revisedPoints;
    leaf.evidence = revisedEvidence;
  }
  return parseDirectDiagramOutput(JSON.stringify(initial), criteria);
}

export function directDiagramPointRepairSchema(maximum: number) {
  return object({
    points: { type: 'number', minimum: Math.min(0, maximum), maximum: Math.max(0, maximum) },
    evidence: { type: 'string' },
  });
}

/** Only the flagged score and its evidence may change. Revalidate the whole
 * rubric afterwards; any other invalid or incomplete field remains an error. */
export function applyDirectDiagramPointRepair(
  originalRaw: string, repairRaw: string, issue: DirectDiagramPointRepair,
  criteria: RubricCriterion[],
): string {
  let corrected: unknown;
  let initial: unknown;
  try {
    corrected = parseModelJson(repairRaw);
    initial = parseModelJson(originalRaw);
  } catch { fail('invalid-json'); }
  exactKeys(corrected, ['points', 'evidence']);
  const newPoints = points(corrected.points, issue.maximum,
    issue.subcriterionId ? `${issue.criterionId}.subcriteria.${issue.subcriterionId}.points`
      : `${issue.criterionId}.points`);
  const newEvidence = evidence(corrected.evidence);
  if (!record(initial) || !record(initial.criteria)) fail('invalid-shape');
  const criterion = initial.criteria[issue.criterionId];
  if (!record(criterion)) fail('invalid-shape');
  const leaf = issue.subcriterionId
    ? record(criterion.subcriteria) ? criterion.subcriteria[issue.subcriterionId] : null
    : criterion;
  if (!record(leaf)) fail('invalid-shape');
  leaf.points = newPoints;
  leaf.evidence = newEvidence;
  return parseDirectDiagramOutput(JSON.stringify(initial), criteria);
}

export function parseDirectDiagramOutput(raw: string, criteria: RubricCriterion[]): string {
  let parsed: unknown;
  try { parsed = parseModelJson(raw); } catch { fail('invalid-json'); }
  if (!record(parsed)) fail('invalid-shape');
  exactKeys(parsed.criteria, criteria.map(c => c.id));
  const entries = parsed.criteria;
  const proposals = criteria.map(c => {
    const item = entries[c.id];
    if (!record(item)) fail('invalid-shape');
    if (!['low', 'medium', 'high'].includes(String(item.confidence))) fail('invalid-confidence');
    // Some models use explicit null for an absent optional teacher question.
    // Preserve the strict contract for every other type (including missing fields).
    if (item.questionForTeacher !== null && typeof item.questionForTeacher !== 'string') {
      throw new Error(`Sortie schéma invalide [diagram-output:invalid-shape] : ${c.id}.questionForTeacher attend une chaîne ou null.`);
    }
    const subs = getRubricSubcriteria(c);
    const contradictions: string[] = [];
    let subcriteria;
    if (subs.length) {
      exactKeys(item.subcriteria, subs.map(s => s.id));
      const values = item.subcriteria;
      subcriteria = subs.map(s => {
        const entry = values[s.id];
        if (!record(entry)) fail('invalid-shape');
        const proposed = points(entry.points, s.maxPoints, `${c.id}.subcriteria.${s.id}.points`);
        const proof = evidence(entry.evidence);
        const scoring = evaluateObservableScore(s.title, proof, proposed, s.maxPoints, entry.observations);
        if (scoring.reason) contradictions.push(s.title + ' : ' + scoring.reason);
        return { subcriterionId: s.id, points: scoring.points, evidence: proof };
      });
    }
    const originalCriterionScore = subcriteria ? undefined : points(item.points, c.maxPoints, `${c.id}.points`);
    const entireCriterion = originalCriterionScore === undefined ? null
      : evaluateObservableScore(c.title, evidence(item.evidence), originalCriterionScore, c.maxPoints);
    if (entireCriterion?.reason) contradictions.push(entireCriterion.reason);
    return {
      criterionId: c.id, evidence: evidence(item.evidence), confidence: contradictions.length ? 'low' : item.confidence,
      rationale: '', questionForTeacher: [item.questionForTeacher ?? '', ...contradictions].filter(Boolean).join(' '),
      points: subcriteria ? sumGradeScores(subcriteria.map(s => s.points)) : entireCriterion!.points,
      ...(subcriteria ? { subcriteria } : {}),
    };
  });
  const output = JSON.stringify({ summary: 'Proposition visuelle à vérifier.', criteria: proposals,
    questionsForTeacher: [], finalScore: sumGradeScores(proposals.map(c => c.points)) });
  // Preserve the production validator; never infer missing marks or clamp invalid ones.
  parseGradingProposal(output, { title: 'Schéma', criteria });
  return output;
}

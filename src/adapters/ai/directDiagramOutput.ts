import { parseModelJson } from '../../domain/modelJson.ts';
import { parseGradingProposal } from '../../domain/grading.ts';
import { getRubricSubcriteria, type RubricCriterion } from '../../domain/rubric.ts';
import { sumGradeScores } from '../../domain/scorePrecision.ts';

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
      })]))) } : { points: { type: 'number', minimum: Math.min(0, c.maxPoints), maximum: Math.max(0, c.maxPoints) } }),
    })];
  }))) });
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
  originalValue: unknown;
  originalEvidence: string;
}

export function findSingleInvalidDiagramPoint(
  raw: string, criteria: RubricCriterion[],
): DirectDiagramPointRepair | null {
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
          originalValue: grade,
          originalEvidence: typeof value.evidence === 'string' ? value.evidence : '',
        });
      }
    }
  }
  return invalid.length === 1 ? invalid[0]! : null;
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
    if (typeof item.questionForTeacher !== 'string') fail('invalid-shape');
    const subs = getRubricSubcriteria(c);
    let subcriteria;
    if (subs.length) {
      exactKeys(item.subcriteria, subs.map(s => s.id));
      const values = item.subcriteria;
      subcriteria = subs.map(s => {
        const entry = values[s.id];
        if (!record(entry)) fail('invalid-shape');
        return { subcriterionId: s.id, points: points(entry.points, s.maxPoints, `${c.id}.subcriteria.${s.id}.points`), evidence: evidence(entry.evidence) };
      });
    }
    return {
      criterionId: c.id, evidence: evidence(item.evidence), confidence: item.confidence,
      rationale: '', questionForTeacher: item.questionForTeacher,
      points: subcriteria ? sumGradeScores(subcriteria.map(s => s.points)) : points(item.points, c.maxPoints, `${c.id}.points`),
      ...(subcriteria ? { subcriteria } : {}),
    };
  });
  const output = JSON.stringify({ summary: 'Proposition visuelle à vérifier.', criteria: proposals,
    questionsForTeacher: [], finalScore: sumGradeScores(proposals.map(c => c.points)) });
  // Preserve the production validator; never infer missing marks or clamp invalid ones.
  parseGradingProposal(output, { title: 'Schéma', criteria });
  return output;
}

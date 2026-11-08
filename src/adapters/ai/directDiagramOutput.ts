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

function points(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < Math.min(0, maximum) || value > Math.max(0, maximum)) fail('invalid-points');
  return value;
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
        return { subcriterionId: s.id, points: points(entry.points, s.maxPoints), evidence: evidence(entry.evidence) };
      });
    }
    return {
      criterionId: c.id, evidence: evidence(item.evidence), confidence: item.confidence,
      rationale: '', questionForTeacher: item.questionForTeacher,
      points: subcriteria ? sumGradeScores(subcriteria.map(s => s.points)) : points(item.points, c.maxPoints),
      ...(subcriteria ? { subcriteria } : {}),
    };
  });
  const output = JSON.stringify({ summary: 'Proposition visuelle à vérifier.', criteria: proposals,
    questionsForTeacher: [], finalScore: sumGradeScores(proposals.map(c => c.points)) });
  // Preserve the production validator; never infer missing marks or clamp invalid ones.
  parseGradingProposal(output, { title: 'Schéma', criteria });
  return output;
}

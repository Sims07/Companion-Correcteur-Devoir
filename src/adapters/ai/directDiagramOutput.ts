import { parseModelJson } from '../../domain/modelJson.ts';
import { parseGradingProposal } from '../../domain/grading.ts';
import { getRubricSubcriteria, type RubricCriterion } from '../../domain/rubric.ts';
import { normalizeGradeScore, sumGradeScores } from '../../domain/scorePrecision.ts';

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
        creditFraction: {
          type: 'number', minimum: 0, maximum: 1,
          description: `Part du maximum ${s.maxPoints} accordée à cet attendu : 0 = aucun, 1 = maximum complet.`,
        }, evidence: { type: 'string' },
      })]))) } : { creditFraction: {
        type: 'number', minimum: 0, maximum: 1,
        description: `Part du maximum ${c.maxPoints} accordée à ce critère : 0 = aucun, 1 = maximum complet.`,
      } }),
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

/** The LLM expresses an award proportion, not a point amount. This avoids
 * confusing the semantic "1 = fully met" with "1 point" for a 0.33-point
 * rubric item. The application (not the model) owns conversion to the barème.
 * Never clamp invalid proportions or invent a grade from the evidence. */
function awardedPoints(value: unknown, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    const received = typeof value === 'number' && Number.isFinite(value)
      ? String(value) : value === null ? 'null' : typeof value;
    throw new Error(`Sortie schéma invalide [diagram-output:invalid-points] : ${path} attend une proportion entre 0 et 1 (reçu : ${received}). Le maximum de ce critère est de ${maximum} point(s).`);
  }
  return normalizeGradeScore(value * maximum);
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
        return { subcriterionId: s.id, points: awardedPoints(entry.creditFraction, s.maxPoints, `${c.id}.subcriteria.${s.id}.creditFraction`), evidence: evidence(entry.evidence) };
      });
    }
    return {
      criterionId: c.id, evidence: evidence(item.evidence), confidence: item.confidence,
      rationale: '', questionForTeacher: item.questionForTeacher,
      points: subcriteria ? sumGradeScores(subcriteria.map(s => s.points)) : awardedPoints(item.creditFraction, c.maxPoints, `${c.id}.creditFraction`),
      ...(subcriteria ? { subcriteria } : {}),
    };
  });
  const output = JSON.stringify({ summary: 'Proposition visuelle à vérifier.', criteria: proposals,
    questionsForTeacher: [], finalScore: sumGradeScores(proposals.map(c => c.points)) });
  // Preserve the production validator; never infer missing marks or clamp invalid ones.
  parseGradingProposal(output, { title: 'Schéma', criteria });
  return output;
}

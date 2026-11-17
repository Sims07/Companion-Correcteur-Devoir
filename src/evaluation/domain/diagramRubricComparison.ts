import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import { getRubricSubcriteria, rubricEvaluationSignature, type Rubric } from '../../correction/domain/rubric.ts';

/** Compare *interpretation* of the same teacher rubric. Scoring weights and IDs
 * must stay identical; otherwise any difference could be a scoring-system change. */
export interface RubricCampaignComparison {
  status: 'same' | 'clarified' | 'incompatible' | 'unavailable';
  label: string;
  changedCriteria: string[];
}

function rubricFrom(entry: DiagramLabArchiveEntry): Rubric | null {
  const report = entry.report;
  if (!('rubric' in report)) return null;
  const value = report.rubric as Rubric;
  return value && Array.isArray(value.criteria) ? value : null;
}

function rubricStructure(rubric: Rubric): string {
  return JSON.stringify(rubric.criteria.map(c=>({
    id:c.id,maxPoints:c.maxPoints,
    subcriteria:getRubricSubcriteria(c).map(s=>({id:s.id,maxPoints:s.maxPoints})),
  })));
}

export function compareCampaignRubrics(
  current: DiagramLabArchiveEntry, previous: DiagramLabArchiveEntry,
): RubricCampaignComparison {
  const left = rubricFrom(current), right = rubricFrom(previous);
  if (!left || !right) return {status:'unavailable',label:'Barème non disponible dans ces rapports.',changedCriteria:[]};
  if (rubricStructure(left)!==rubricStructure(right)) return {
    status:'incompatible',label:'Les critères ou les points ont changé : les notes ne sont pas comparables directement.',changedCriteria:[],
  };
  if (rubricEvaluationSignature(left)===rubricEvaluationSignature(right)) return {
    status:'same',label:'Même formulation du barème dans les deux campagnes.',changedCriteria:[],
  };
  const changedCriteria=left.criteria.flatMap((criterion,i)=>{
    const other=right.criteria[i]!;
    return JSON.stringify({title:criterion.title,description:criterion.description,children:getRubricSubcriteria(criterion).map(s=>({title:s.title,description:s.description}))})
      ===JSON.stringify({title:other.title,description:other.description,children:getRubricSubcriteria(other).map(s=>({title:s.title,description:s.description}))})
      ? [] : [criterion.title];
  });
  return {
    status:'clarified',
    label:'Formulation du barème différente à critères et points constants. Une comparaison fiable exige les mêmes images, modèles, méthodes et références enseignantes.',
    changedCriteria,
  };
}

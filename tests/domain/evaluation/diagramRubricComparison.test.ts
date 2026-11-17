import { describe, expect, it } from 'vitest';
import { compareCampaignRubrics } from '../../../src/evaluation/domain/diagramRubricComparison.ts';
import type { DiagramLabArchiveEntry } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const initial: Rubric={title:'Mitose',criteria:[{id:'title',title:'Titre principal',description:'Titre présent',maxPoints:0.33,
  subcriteria:[{id:'emphasis',title:'Souligné ou encadré ou en majuscule',description:'',maxPoints:0.33}]}]};
const clarified: Rubric=structuredClone(initial);
clarified.criteria[0].subcriteria![0].description='Le titre doit satisfaire au moins une des trois conditions.';

function entry(rubric:Rubric):DiagramLabArchiveEntry {
  return {id:'run',protocol:'personal',createdAt:'2026-11-17T10:00:00Z',savedAt:'2026-11-17T10:00:00Z',
    state:'finished',title:'Test',profiles:['Qwen'],plannedRepetitions:1,experimentCount:1,successfulCount:1,localOnly:true,
    report: {format:'companion-scientific-diagram-protocol',rubric} as unknown as DiagramLabArchiveEntry['report']};
}

describe('comparaison des campagnes par version du barème',()=>{
  it('détecte les reformulations à points et identifiants constants',()=>{
    const comparison=compareCampaignRubrics(entry(initial),entry(clarified));
    expect(comparison.status).toBe('clarified');
    expect(comparison.changedCriteria).toEqual(['Titre principal']);
    expect(comparison.label).toContain('mêmes images');
  });
  it('distingue un barème inchangé et un changement de pondération incompatible',()=>{
    expect(compareCampaignRubrics(entry(initial),entry(initial)).status).toBe('same');
    const other=structuredClone(clarified);
    other.criteria[0].subcriteria![0].maxPoints=0.5;
    expect(compareCampaignRubrics(entry(initial),entry(other)).status).toBe('incompatible');
  });
});

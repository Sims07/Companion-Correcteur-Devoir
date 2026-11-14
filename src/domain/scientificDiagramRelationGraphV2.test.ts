import { describe, expect, it } from 'vitest';
import {
  parseObservedRelationGraphV2, auditRelationGraphV2, DIAGRAM_RELATIONS_V2_PROMPT,
  type ObservedRelationGraphV2,
} from './scientificDiagramRelationGraphV2.ts';
import { fixtureRelationExpectationsV2 } from './scientificDiagramFixtures.ts';

export function relationGraphExample(swapped = false): ObservedRelationGraphV2 {
  const labels = [
    ['l1','Noyau','interphase'], ['l2','Chromosomes','prophase'],
    ['l3','Chromosomes','metaphase'], ['l4','Fuseau mitotique','metaphase'],
    ['l5','Noyau fils','telophase'], ['l6','Plaque cellulaire','telophase'],
  ] as const;
  const structures = [
    ['s1','nucleus','interphase'], ['s2','chromosomes','prophase'],
    ['s3','chromosomes','metaphase'], ['s4','spindle','metaphase'],
    ['s5','nucleus','telophase'], ['s6','cell-plate','telophase'],
  ] as const;
  const targets = swapped ? ['s1','s2','s4','s3','s6','s5'] : ['s1','s2','s3','s4','s5','s6'];
  return {
    labels: labels.map(([id,text,phase]) => ({id,text,phase})),
    structures: structures.map(([id,kind,phase]) => ({id,kind,phase,visualCue:'Forme visible dans la zone'})),
    leaders: labels.map(([id],index) => ({labelId:id,targetId:targets[index]!,
      status:'connected' as const,tipX:100+index*100,tipY:200+index*100})),
    layout:'rows',complete:true,
  };
}

describe('graphe de relations scientifiques V2', () => {
  it('reconnaît le contrôle et les quatre destinations inversées sans modifier les mots', () => {
    const d = parseObservedRelationGraphV2(JSON.stringify(relationGraphExample()));
    const e = parseObservedRelationGraphV2(JSON.stringify(relationGraphExample(true)));
    expect(d.labels).toEqual(e.labels);
    expect(d.structures).toEqual(e.structures);
    expect(d.leaders.filter((line,index) => line.targetId !== e.leaders[index]!.targetId)).toHaveLength(4);
    expect(auditRelationGraphV2(d,fixtureRelationExpectationsV2('D'))).toMatchObject({
      correct:6,wrong:0,uncertain:0,observedLayout:'rows',
    });
    expect(auditRelationGraphV2(e,fixtureRelationExpectationsV2('E'))).toMatchObject({
      correct:6,wrong:0,uncertain:0,observedLayout:'rows',
    });
    expect(auditRelationGraphV2(e,fixtureRelationExpectationsV2('D'))).toMatchObject({
      correct:2,wrong:4,uncertain:0,
    });
    expect(DIAGRAM_RELATIONS_V2_PROMPT).not.toMatch(/0,68|9,34|8,66|D\/E|référence|barème fourni/i);
  });

  it('ne confond jamais trait absent, pointe manquante et contact réellement observé', () => {
    const source = relationGraphExample();
    source.leaders[2] = {labelId:'l3',targetId:'unknown',status:'uncertain',tipX:-1,tipY:-1};
    source.leaders[4] = {labelId:'l5',targetId:'unknown',status:'missing',tipX:-1,tipY:-1};
    const graph = parseObservedRelationGraphV2(JSON.stringify(source));
    const result = auditRelationGraphV2(graph,fixtureRelationExpectationsV2('D'));
    expect(result).toMatchObject({correct:4,wrong:0,uncertain:2});
    expect(result.findings[2]).toMatchObject({state:'uncertain',observedKind:null});
    // The label alone, or a model assertion complete=true, is not a pointer.
    expect(result.findings[4]).toMatchObject({state:'uncertain',observedKind:null});
  });

  it('rejette les identifiants imaginaires, doublons, destinations incohérentes et coordonnées invalides', () => {
    const mutate = (fn: (value: ObservedRelationGraphV2) => void) => {
      const graph = relationGraphExample();fn(graph);
      return () => parseObservedRelationGraphV2(JSON.stringify(graph));
    };
    expect(mutate(g => { g.leaders[0]!.targetId='not-a-structure'; })).toThrow(/identifiant absent/);
    expect(mutate(g => { g.leaders[0]!.labelId='not-a-label'; })).toThrow(/identifiant absent/);
    expect(mutate(g => { g.labels[1]!.id='l1'; })).toThrow(/dupliqués/);
    expect(mutate(g => { g.leaders[0]!.tipX=-1; })).toThrow(/incomplètes/);
    expect(mutate(g => { g.leaders[0]!.tipX=1500; })).toThrow(/Coordonnée/);
    expect(mutate(g => { g.leaders[0]!.targetId='unknown'; })).toThrow(/Cible V2/);
    expect(mutate(g => { g.leaders[0]!.status='uncertain'; })).toThrow(/Cible V2 spéculative/);
    expect(() => parseObservedRelationGraphV2('{bad')).toThrow(/JSON/);
    expect(() => parseObservedRelationGraphV2('x'.repeat(24001))).toThrow(/trop long/);
  });

  it('évite un faux positif si l’étiquette est dupliquée ou si le graphe n’identifie pas la structure', () => {
    const graph = relationGraphExample();
    graph.labels.push({...graph.labels[2]!,id:'l7'});
    const duplicated = auditRelationGraphV2(graph,fixtureRelationExpectationsV2('D'));
    expect(duplicated.findings[2]).toMatchObject({state:'uncertain'});
    graph.labels.pop();
    graph.structures[2]!.kind='unclear';
    expect(auditRelationGraphV2(graph,fixtureRelationExpectationsV2('D')).findings[2]).toMatchObject({
      state:'uncertain',observedKind:null,
    });
    expect(fixtureRelationExpectationsV2('A')).toEqual([]);
  });
});

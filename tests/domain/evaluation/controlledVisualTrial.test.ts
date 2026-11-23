import { expect,it } from 'vitest';
import { readAnswer,runVisualTrial, type VisualRow } from '../../../src/evaluation/domain/controlledVisualTrial.ts';

it('isole huit conversations et limite à une relecture même si la preuve reste absente',async () => {
  const sessions = new Map<object,number>(), rows:VisualRow[] = [];
  await runVisualTrial(async (_drawing,session,prompt) => {
    sessions.set(session,(sessions.get(session) ?? 0)+1);
    expect(prompt).not.toContain('trait déplacé');
    return {verdict:'indéterminé',preuve:''};
  },new AbortController().signal,(_,row) => { if (row) rows.push(row); });
  expect([...sessions.values()]).toEqual(Array(8).fill(4));
  expect(rows).toHaveLength(16);
  expect(rows.every(r => r.review && r.reread)).toBe(true);
  expect(rows.filter(r => r.expected === 'non')).toHaveLength(4);
  expect(rows.slice(0,4).map(r => r.target)).toEqual(['titre','liaison','liaison','titre']);
});
it('interrompt une réponse tardive avant toute publication',async () => {
  const controller = new AbortController(),rows:VisualRow[] = [];
  await expect(runVisualTrial(async () => {
    controller.abort(); return {verdict:'oui',preuve:'soulignement visible'};
  },controller.signal,(_,row) => { if (row) rows.push(row); })).rejects.toThrow();
  expect(rows).toEqual([]);
});
it('traite les sorties illisibles comme indéterminées',() => {
  expect(readAnswer('réponse tronquée').verdict).toBe('indéterminé');
  expect(readAnswer('{"verdict":"non","preuve":"  aucun trait  "}')).toEqual({verdict:'non',preuve:'aucun trait'});
});
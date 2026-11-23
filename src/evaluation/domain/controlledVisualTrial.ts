export const visualCases = ['témoin', 'titre sans soulignement', 'trait avec pointe', 'trait déplacé'] as const;
export type VisualCase = typeof visualCases[number];
export type Target = 'titre' | 'liaison';
export type Choice = 'oui' | 'non' | 'indéterminé';
export interface Answer { verdict: Choice; preuve: string }
export interface VisualRow {
  drawing: VisualCase; order: number; target: Target; expected: Choice;
  first: Answer; reread?: Answer; review: boolean; durationMs: number;
}
export const visualPromptVersion = 'lecture-controlee-v1';
export function readAnswer(raw: string): Answer {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,''));
    if (['oui','non','indéterminé'].includes(parsed?.verdict) && typeof parsed.preuve === 'string')
      return { verdict:parsed.verdict, preuve:parsed.preuve.trim() };
  } catch { /* One targeted retry can recover an incomplete response. */ }
  return { verdict:'indéterminé', preuve:'' };
}
export async function runVisualTrial(
  ask: (drawing: VisualCase, session: {responseId?: string}, prompt: string) => Promise<Answer>,
  signal: AbortSignal, progress: (label: string, row?: VisualRow) => void,
) {
  const questions = { titre:'Le titre est-il souligné par un trait visible sous les lettres ?',
    liaison:'Le trait de la légende « Noyau » aboutit-il au noyau ? Une pointe est facultative.' };
  const checks = { titre:'Localise le titre puis décris ce qui se trouve immédiatement sous ses lettres.',
    liaison:'Pars de la légende « Noyau », suis le trait et nomme la structure touchée à son extrémité.' };
  const format = ' Réponds uniquement en JSON avec verdict (« oui », « non » ou « indéterminé ») et preuve (une observation précise).';
  for (const drawing of visualCases) {
    const orders: Target[][] = [['titre','liaison'],['liaison','titre']];
    for (const [order,targets] of orders.entries()) {
      const session = {};
      for (const target of targets) {
        signal.throwIfAborted();
        const label = drawing + ' · ordre ' + (order+1) + ' · ' + target;
        progress(label);
        const start = performance.now();
        const first = await ask(drawing,session,questions[target]+format);
        signal.throwIfAborted();
        let reread: Answer | undefined;
        if (first.verdict === 'indéterminé' || !first.preuve) {
          progress(label + ' · seconde lecture');
          reread = await ask(drawing,session,checks[target]+' '+questions[target]+format);
          signal.throwIfAborted();
        }
        const last = reread ?? first;
        progress(label,{ drawing, order:order+1, target, expected:
          (target === 'titre' && drawing === 'titre sans soulignement') ||
          (target === 'liaison' && drawing === 'trait déplacé') ? 'non' : 'oui',
          first, reread, review:last.verdict === 'indéterminé' || !last.preuve ||
            (!!reread && first.verdict !== 'indéterminé' && first.verdict !== reread.verdict),
          durationMs:Math.round(performance.now()-start) });
      }
    }
  }
}

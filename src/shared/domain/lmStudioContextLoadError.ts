/** An MLX model may have a hard minimum context larger than AutoFit's memory budget. */
export function explainLmStudioContextLoadError(raw: string): string | null {
  const match = /MLX AutoFit selected a context length of\s*(\d+)\s*,?\s*below the required minimum of\s*(\d+)/i.exec(raw);
  if (!match) return null;
  const chosen = Number(match[1]);
  const minimum = Number(match[2]);
  if (!Number.isSafeInteger(chosen) || !Number.isSafeInteger(minimum) || chosen >= minimum) return null;
  return `LM Studio ne peut pas charger ce modèle : MLX AutoFit propose ${chosen.toLocaleString('fr-FR')} tokens, mais le modèle exige au minimum ${minimum.toLocaleString('fr-FR')}. Essayez de libérer de la mémoire et de configurer un contexte d’au moins ${minimum.toLocaleString('fr-FR')} dans LM Studio. Si la mémoire reste insuffisante, utilisez une quantification ou un modèle plus léger. Ne réduisez pas le contexte sous le minimum requis.`;
}

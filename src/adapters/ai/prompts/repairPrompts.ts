/** Instructions de repli et arbitrage, indépendantes des transports réseau. */

export function buildArbitrationPrompt(disputedRubric: unknown, transcription: string, first: unknown, second: unknown): string {
  return [
          'RÔLE : arbitre uniquement, tu n’es pas un troisième correcteur. Tu ne dois pas générer de correction complète.',
          'Pour chaque critère litigieux, choisis exclusivement la note déjà donnée par AVIS 1 ou AVIS 2. Interdiction de créer une troisième note, de calculer une moyenne ou de modifier un critère non litigieux.',
          'Ne crée jamais de troisième note, de moyenne ni de critère supplémentaire.',
          `BARÈME DES CRITÈRES LITIGIEUX :\n${JSON.stringify(disputedRubric)}`,
          `TRANSCRIPTION :\n${transcription}`,
          `AVIS 1 (JSON) :\n${JSON.stringify(first)}`,
          `AVIS 2 (JSON) :\n${JSON.stringify(second)}`,
          'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte ni Markdown. Retourne une décision par critère litigieux : criterionId, selected (avis1 ou avis2), reason (phrase courte). Exemple neutre : {"decisions":[{"criterionId":"criterion-id","selected":"avis1","reason":"Justification courte."}]}.',
        ].join('\n\n');
}

export function buildArbitrationRepairPrompt(arbitrationPrompt: string, raw: string, reason: string): string {
  return [arbitrationPrompt, 'Réponse précédente à réparer : ' + raw.slice(0, 2500) + '. Erreur : ' + reason + '.', 'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte ni Markdown. Exemple neutre : {"decisions":[{"criterionId":"criterion-id","selected":"avis1","reason":"Justification courte."}]}.' ].join('\n\n');
}

export function buildIncrementalGradingRepairPrompt(criterionPrompt: string, previousRaw: string, lastError: string): string {
  return [criterionPrompt, `Réponse précédente à réparer : ${previousRaw.slice(0, 2500)}. Erreur : ${lastError}. Corrige le JSON sans modifier la note si elle respecte le barème.`, 'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte ni Markdown. Exemple neutre : {"criterionId":"criterion-id","points":0,"rationale":"Justification courte.","evidence":"Extrait exact.","confidence":"medium","annotationSuggestion":""}.'].join('\n\n');
}

export function buildGradingRepairPrompt(prompt: string, raw: string, reason: string): string {
  return [prompt, 'Réponse précédente à réparer : ' + raw.slice(0, 3000) + '. Erreur : ' + reason + '.', 'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte ni Markdown. Exemple neutre : {"summary":"Proposition à vérifier.","criteria":[{"criterionId":"criterion-id","points":0,"rationale":"Justification courte.","evidence":"Extrait exact.","confidence":"medium","annotationSuggestion":""}],"questionsForTeacher":[],"finalScore":0}.'].join('\n\n');
}

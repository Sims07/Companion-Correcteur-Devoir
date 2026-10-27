import type { GradingProvider, GradingRequest, OllamaModel, OllamaSettings } from '../../ports/aiProvider.ts';

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

function normalizedEndpoint(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) throw new Error('L’adresse Ollama doit commencer par http:// ou https://.');
  return value;
}

/** Sends a small text-only request first so the UI can confirm that the selected model actually responds. */
export async function checkOllamaReady(
  settings: OllamaSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  if (!settings.model.trim()) throw new Error('Choisissez un modèle Ollama.');
  const response = await fetchImpl(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: [{ role: 'user', content: 'Ceci est un test de disponibilité, aucune copie à analyser. Réponds uniquement par le mot PRÊT.' }],
    }),
  });
  if (!response.ok) throw new Error(`Le test de disponibilité Ollama a échoué (HTTP ${response.status}).`);
  const data = await response.json() as OllamaChatResponse;
  if (data.error) throw new Error('Ollama signale une erreur pendant le test de disponibilité.');
  if (!data.message?.content?.trim()) throw new Error('Le modèle Ollama n’a pas répondu au test de disponibilité.');
}

export async function listOllamaModels(endpoint: string, fetchImpl: typeof fetch = fetch): Promise<OllamaModel[]> {
  const response = await fetchImpl(`${normalizedEndpoint(endpoint)}/api/tags`);
  if (!response.ok) throw new Error(`Connexion Ollama impossible (HTTP ${response.status}). Vérifiez Ollama et ses autorisations CORS.`);
  const data = await response.json() as OllamaTagsResponse;
  return (data.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name)).map((name) => ({ name }));
}

/** Browser-side adapter: sends requests only to the endpoint explicitly configured by the teacher. */
export function createOllamaProvider(
  settings: OllamaSettings,
  fetchImpl: typeof fetch = fetch,
): GradingProvider {
  return {
    id: 'ollama',
    async generate(request: GradingRequest): Promise<string> {
      const endpoint = normalizedEndpoint(settings.endpoint);
      if (!settings.model.trim()) throw new Error('Choisissez un modèle Ollama.');
      if (!request.question.trim()) throw new Error('La consigne de correction est vide.');
      if (!request.images?.length) throw new Error('Ajoutez au moins une photo ou un PDF avant de lancer la correction.');

      const prompt = [
        'RÔLE : tu assistes un enseignant universitaire en biologie. Tu proposes une correction, tu ne prends jamais la décision finale.',
        'CONTRAT DE SORTIE : retourne uniquement un objet JSON valide conforme au schéma fourni. Pas de Markdown, pas de texte avant ou après. Utilise les identifiants de critères exactement tels qu’ils apparaissent dans le barème.',
        'FIDÉLITÉ AU BARÈME : évalue chaque critère séparément selon sa description et son maximum de points. N’ajoute, ne fusionne et ne supprime aucun critère. N’invente pas de sous-critères, de pénalités ou d’attendus absents du barème. Ne pénalise l’orthographe ou la formulation que si le barème le prévoit. Accepte une formulation scientifiquement équivalente lorsqu’elle exprime correctement la notion attendue.',
        'LECTURE DE LA COPIE : base-toi uniquement sur les images fournies. N’infère pas qu’un élément est présent s’il est absent, coupé ou illisible. Ne confonds pas une mauvaise lecture de l’écriture manuscrite avec une erreur scientifique. Pour les schémas, légendes, symboles, unités et formules, ne décris que ce que tu peux réellement distinguer.',
        'JUSTIFICATION : pour chaque critère, donne une rationale concise expliquant le lien entre la réponse observée et le barème, et une evidence courte, fidèle et repérable dans la copie. Si aucune preuve textuelle fiable ne peut être citée, dis-le explicitement dans evidence ; ne fabrique jamais de citation.',
        'NOTATION : points doit être un nombre compris entre 0 et maxPoints du critère. Attribue seulement les points justifiables par la copie et le barème. N’invente pas de précision artificielle. confidence vaut low, medium ou high selon la lisibilité et la solidité de l’interprétation, pas selon le ton de la réponse.',
        'INCERTITUDE : utilise confidence="low" si la lecture, le schéma ou l’interprétation est ambiguë, si une preuve manque, ou si plusieurs évaluations sont plausibles. Dans ce cas, renseigne questionForTeacher avec une question concrète et neutre. Ajoute aussi les questions importantes dans questionsForTeacher. Ne tranche pas au hasard et ne masque pas une incertitude.',
        'EXHAUSTIVITÉ ET COHÉRENCE : retourne exactement une entrée pour chaque critère du barème, sans doublon ni identifiant inconnu. Si la copie ne contient pas de réponse identifiable pour un critère, évalue seulement ce que le barème autorise et explique l’absence de preuve ; si tu ne peux pas déterminer si une réponse est absente ou illisible, demande confirmation.',
        'SCHÉMA JSON : {"summary":"résumé prudent","criteria":[{"criterionId":"identifiant exact","points":0,"rationale":"justification liée au barème","evidence":"preuve observable ou limite de lecture explicite","confidence":"low|medium|high","questionForTeacher":""}],"questionsForTeacher":[]}. summary doit signaler que la proposition est à vérifier. questionForTeacher peut être une chaîne vide si aucune clarification n’est nécessaire.',
        'La note et les explications sont des propositions de travail, jamais une validation définitive. N’affirme pas avoir vérifié un élément que tu ne peux pas lire.',
        `BARÈME (JSON) :\n${request.rubric}`,
        `CONSIGNE DE L’ENSEIGNANT :\n${request.question}`,
      ].join('\n\n');

      let response: Response;
      try {
        response = await fetchImpl(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: settings.model,
            stream: false,
            format: 'json',
            messages: [{
              role: 'user',
              content: prompt,
              images: request.images.map((image) => image.base64),
            }],
          }),
        });
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : 'erreur réseau inconnue';
        throw new Error(
          `Connexion à Ollama interrompue pendant l’analyse (modèle « ${settings.model} », ${request.images.length} image(s)). Vérifiez que le serveur Ollama fonctionne toujours, que la mémoire disponible suffit et consultez ses journaux. Détail réseau : ${detail}`,
        );
      }
      if (!response.ok) throw new Error(`Ollama a répondu avec le statut HTTP ${response.status}.`);
      const data = await response.json() as OllamaChatResponse;
      if (data.error) throw new Error('Ollama n’a pas pu traiter la demande.');
      const content = data.message?.content?.trim();
      if (!content) throw new Error('Ollama a retourné une réponse vide.');
      return content;
    },
  };
}

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
        'Tu es un assistant de correction universitaire en biologie. Réponds exclusivement avec un objet JSON valide, sans Markdown.',
        'Respecte strictement le barème. N’invente jamais le contenu illisible ou absent. Cite dans evidence des mots, notions ou passages réellement lisibles ; si tu ne peux pas les localiser, indique-le.',
        'Pour chaque critère, attribue points entre 0 et maxPoints, donne rationale, evidence, confidence (low, medium ou high), et questionForTeacher si nécessaire.',
        'Le JSON doit respecter cette structure : {"summary":"...","criteria":[{"criterionId":"identifiant exact du barème","points":0,"rationale":"...","evidence":"...","confidence":"low|medium|high","questionForTeacher":""}],"questionsForTeacher":[]}.',
        'Inclue une entrée pour chaque critère. Signale toute incertitude et pose des questions à l’enseignant. Ne présente jamais la note comme définitive ; l’enseignant décide.',
        `BARÈME JSON :\n${request.rubric}`,
        `CONSIGNE :\n${request.question}`,
      ].join('\n\n');

      const response = await fetchImpl(`${endpoint}/api/chat`, {
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
      if (!response.ok) throw new Error(`Ollama a répondu avec le statut HTTP ${response.status}.`);
      const data = await response.json() as OllamaChatResponse;
      if (data.error) throw new Error('Ollama n’a pas pu traiter la demande.');
      const content = data.message?.content?.trim();
      if (!content) throw new Error('Ollama a retourné une réponse vide.');
      return content;
    },
  };
}

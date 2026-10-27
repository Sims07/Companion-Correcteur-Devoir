import type { GradingProvider, GradingRequest, OllamaSettings } from '../../ports/aiProvider.ts';

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

/** Browser-side Ollama adapter. It only targets the explicitly configured endpoint. */
export function createOllamaProvider(
  settings: OllamaSettings,
  fetchImpl: typeof fetch = fetch,
): GradingProvider {
  return {
    id: 'ollama',
    async generate(request: GradingRequest): Promise<string> {
      const endpoint = settings.endpoint.replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(endpoint)) throw new Error('L’adresse Ollama doit commencer par http:// ou https://.');
      if (!settings.model.trim()) throw new Error('Choisissez un modèle Ollama.');
      if (!request.question.trim()) throw new Error('La consigne de correction est vide.');

      const images = request.images ?? [];
      const prompt = [
        'Tu es un assistant de correction universitaire en biologie.',
        'Respecte strictement le barème fourni. N’invente jamais de contenu illisible.',
        'Si une réponse ou une image est ambiguë, indique explicitement l’incertitude et pose une question à l’enseignant.',
        'Fournis une proposition justifiée, critère par critère. La décision finale appartient à l’enseignant.',
        `BARÈME :\n${request.rubric}`,
        `CONSIGNE :\n${request.question}`,
      ].join('\n\n');

      const response = await fetchImpl(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          messages: [{
            role: 'user',
            content: prompt,
            ...(images.length ? { images: images.map(image => image.base64) } : {}),
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

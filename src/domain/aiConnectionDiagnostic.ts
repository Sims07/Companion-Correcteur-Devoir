/** Actionable, browser-side feedback for the single Ollama connectivity button.
 * A failed fetch cannot reliably distinguish CORS, a browser permission,
 * mixed content or a stopped server. Never claim one is proven. */
export function describeAiConnectionFailure(
  cause: unknown, endpoint: string, pageProtocol: string,
): string {
  const detail = cause instanceof Error ? cause.message : 'Échec de connexion inconnu.';
  const networkFailure = cause instanceof TypeError ||
    /failed to fetch|load failed|networkerror|network request failed|cors|mixed content/i.test(detail);
  if (!networkFailure) return 'Connexion impossible : ' + detail;

  let destination: URL | null = null;
  try { destination = new URL(endpoint); } catch { /* Invalid URLs are reported by fetch. */ }
  if (pageProtocol === 'https:' && destination?.protocol === 'http:') {
    const host = destination.hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (loopback) {
      return 'Le navigateur n’a pas pu accéder à Ollama sur ce Mac. '
        + 'Depuis la PWA en HTTPS, Safari peut bloquer la connexion HTTP à localhost avant tout appel visible dans Réseau. '
        + 'Essaie la PWA dans Chrome ou Edge et autorise l’accès au réseau local si demandé. '
        + 'Vérifie aussi que l’adresse est http://127.0.0.1:11434 et qu’Ollama est démarré avec OLLAMA_ORIGINS. '
        + 'Un paramétrage CORS correct ne suffit pas si le navigateur bloque la requête.';
    }
    return 'Le navigateur a refusé ou n’a pas pu établir la connexion. '
      + 'Cette PWA est en HTTPS, mais le serveur configuré utilise HTTP : '
      + 'le navigateur peut bloquer le contenu mixte avant tout appel réseau. '
      + 'Utilise un serveur HTTPS local de confiance ou une adresse localhost autorisée par le navigateur.';
  }
  return 'Impossible de joindre le serveur IA depuis ce navigateur. '
    + 'Vérifie que le serveur est démarré, que son adresse est correcte et que les autorisations CORS et réseau local sont accordées. '
    + 'Détail : ' + detail;
}

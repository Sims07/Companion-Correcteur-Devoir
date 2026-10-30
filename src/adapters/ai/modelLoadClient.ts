export interface SalukiLoadSettings { endpoint: string; apiKey: string; }

function salukiLoadUrl(endpoint: string): string {
  const value = endpoint.trim().replace(/\\/+$/, '');
  if (!/^https?:\\/\\//i.test(value)) throw new Error('L’adresse du serveur doit commencer par http:// ou https://.');
  const withoutChatPath = value.replace(/\\/v1\\/chat\\/completions$/i, '');
  const base = withoutChatPath.replace(/\\/v1$/i, '');
  return `${base}/v1/models/saluki-27b/load`;
}

export async function loadSalukiModel(settings: SalukiLoadSettings, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(salukiLoadUrl(settings.endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}) },
  });
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  let detail = body.trim();
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed && typeof parsed.error === 'string') detail = parsed.error;
    else if (typeof parsed === 'object' && parsed !== null && 'message' in parsed && typeof parsed.message === 'string') detail = parsed.message;
  } catch { /* Keep the raw server message when it is not JSON. */ }
  throw new Error(detail || `Le serveur a refusé le chargement de Saluki 27B (HTTP ${response.status}).`);
}

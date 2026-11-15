import type { LocalCorrectionRepository } from '../../ports/localCorrectionRepository.ts';
import { fingerprintRubric, LOCAL_MEMORY_CORRECTION_ID_KEY, LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY, type LocalMemoryEntry, rankLocalMemories } from '../../domain/localMemory.ts';
import { buildLocalMemoryContext } from '../../domain/localMemoryContext.ts';

function readRubricScope(): { correctionId: string; rubricFingerprint: string } | null {
  if (typeof window === 'undefined') return null;
  const correctionId = window.localStorage.getItem(LOCAL_MEMORY_CORRECTION_ID_KEY);
  if (!correctionId) return null;
  const storedFingerprint = window.localStorage.getItem(LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY);
  if (storedFingerprint) return { correctionId, rubricFingerprint: storedFingerprint };
  const titleElement = document.getElementById('rubric-title') as HTMLInputElement | null;
  const title = titleElement?.value.trim() || 'Barème sans nom';
  const rubricEditor = document.querySelector('.rubric-editor');
  const inputs = rubricEditor ? Array.from(rubricEditor.querySelectorAll('input')) : [];
  const rubricJson = JSON.stringify(inputs.map((input) => input.value));
  return { correctionId, rubricFingerprint: fingerprintRubric(title, rubricJson) };
}

export function shouldAugmentAnalysisPrompt(content: string): boolean {
  return content.includes('RÔLE ET LIMITE : tu es un assistant de correction pour un enseignant universitaire en biologie.') &&
    content.includes('BARÈME ACTUEL (JSON, référence de notation)');
}

export function appendLocalMemoryContext(content: string, entries: LocalMemoryEntry[]): string {
  const context = buildLocalMemoryContext(entries);
  return context ? `${content}\n\n${context}` : content;
}

export async function augmentAnalysisPromptWithLocalMemory(content: string, repository: LocalCorrectionRepository): Promise<string> {
  if (!shouldAugmentAnalysisPrompt(content)) return content;
  const scope = readRubricScope();
  if (!scope) return content;
  const currentEntries = await repository.listMemory(scope);
  const current = rankLocalMemories(currentEntries, content, 8);
  const rubricRules = rankLocalMemories(
    (await repository.listMemory({ rubricFingerprint: scope.rubricFingerprint }))
      .filter((entry) => entry.promotedToRubric && entry.correctionId !== scope.correctionId),
    content,
    5,
  );
  const selected = [...current, ...rubricRules]
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index)
    .slice(0, 8);
  return appendLocalMemoryContext(content, selected);
}

/**
 * Keeps the existing Ollama adapter unchanged while injecting only the locally
 * scoped teacher memory into grading prompts. Vision/transcription requests are untouched.
 */
export function installLocalMemoryFetchBridge(repository: LocalCorrectionRepository): () => void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!requestUrl.endsWith('/api/chat') || !init?.body || typeof init.body !== 'string') {
      return originalFetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body) as { messages?: Array<{ role?: string; content?: string }> };
      const message = payload.messages?.find((item) => item.role === 'user');
      if (!message?.content || !shouldAugmentAnalysisPrompt(message.content)) return originalFetch(input, init);
      const content = await augmentAnalysisPromptWithLocalMemory(message.content, repository);
      if (content === message.content) return originalFetch(input, init);
      message.content = content;
      return originalFetch(input, { ...init, body: JSON.stringify(payload) });
    } catch {
      return originalFetch(input, init);
    }
  };
  return () => { window.fetch = originalFetch; };
}

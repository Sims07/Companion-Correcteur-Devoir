import { listLocalMemory } from '../storage/indexedDbMemory.ts';
import { fingerprintRubric, type LocalMemoryEntry } from '../../domain/localMemory.ts';
import { buildLocalMemoryContext } from '../../domain/localMemoryContext.ts';

const CORRECTION_ID_KEY = 'companion-current-correction-id';

function readRubricScope(): { correctionId: string; rubricFingerprint: string } | null {
  if (typeof window === 'undefined') return null;
  const correctionId = window.localStorage.getItem(CORRECTION_ID_KEY);
  if (!correctionId) return null;
  const titleElement = document.getElementById('rubric-title') as HTMLInputElement | null;
  const title = titleElement?.value.trim() || 'Barème sans nom';
  const rubricEditor = document.querySelector('.rubric-editor');
  const inputs = rubricEditor ? Array.from(rubricEditor.querySelectorAll('input')) : [];
  const rubricJson = JSON.stringify(inputs.map((input) => input.value));
  return { correctionId, rubricFingerprint: fingerprintRubric(title, rubricJson) };
}

export function shouldAugmentAnalysisPrompt(content: string): boolean {
  return content.includes('RÔLE : tu assistes un enseignant universitaire en biologie.') && content.includes('BARÈME (JSON)');
}

export function appendLocalMemoryContext(content: string, entries: LocalMemoryEntry[]): string {
  const context = buildLocalMemoryContext(entries);
  return context ? `${content}\n\n${context}` : content;
}

export async function augmentAnalysisPromptWithLocalMemory(content: string): Promise<string> {
  if (!shouldAugmentAnalysisPrompt(content)) return content;
  const scope = readRubricScope();
  if (!scope) return content;
  const current = await listLocalMemory(scope);
  const rubricRules = (await listLocalMemory({ rubricFingerprint: scope.rubricFingerprint }))
    .filter((entry) => entry.promotedToRubric && entry.correctionId !== scope.correctionId);
  return appendLocalMemoryContext(content, [...current, ...rubricRules].slice(0, 8));
}

/**
 * Keeps the existing Ollama adapter unchanged while injecting only the locally
 * scoped teacher memory into grading prompts. Vision/transcription requests are untouched.
 */
export function installLocalMemoryFetchBridge(): () => void {
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
      const content = await augmentAnalysisPromptWithLocalMemory(message.content);
      if (content === message.content) return originalFetch(input, init);
      message.content = content;
      return originalFetch(input, { ...init, body: JSON.stringify(payload) });
    } catch {
      return originalFetch(input, init);
    }
  };
  return () => { window.fetch = originalFetch; };
}

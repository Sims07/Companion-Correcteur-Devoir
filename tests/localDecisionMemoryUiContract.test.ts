import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
const memoryDomain = readFileSync(new URL('../src/domain/localMemory.ts', import.meta.url), 'utf8');
const memoryBridge = readFileSync(new URL('../src/adapters/ai/localMemoryFetchBridge.ts', import.meta.url), 'utf8');
const memoryCompanion = readFileSync(new URL('../src/ui/LocalMemoryCompanion.tsx', import.meta.url), 'utf8');

describe('local decision memory integration contract', () => {
  it('persists teacher adjustments and comments after archiving a correction', () => {
    expect(app).toContain('createDecisionMemoryEntries({');
    expect(app).toContain('await archiveService.saveMemory(entry)');
    expect(app).toContain('ont été conservées dans la mémoire locale');
    expect(memoryDomain).toContain('decision.teacherPoints === proposed.points && !comment');
  });

  it('shares the exact rubric fingerprint between correction UI and prompt retrieval', () => {
    expect(app).toContain('LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY');
    expect(app).toContain('LOCAL_MEMORY_RUBRIC_UPDATED_EVENT');
    expect(memoryCompanion).toContain('window.addEventListener(LOCAL_MEMORY_RUBRIC_UPDATED_EVENT');
    expect(memoryBridge).toContain('window.localStorage.getItem(LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY)');
  });

  it('keeps remembered decisions advisory and scopes retrieval locally', () => {
    expect(memoryBridge).toContain('repository.listMemory(scope)');
    expect(memoryBridge).toContain('rankLocalMemories');
    expect(memoryBridge).toContain('appendLocalMemoryContext(content, selected)');
    expect(memoryBridge).toContain('if (!shouldAugmentAnalysisPrompt(message.content)) return originalFetch(input, init)');
  });
});

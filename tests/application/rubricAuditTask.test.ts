import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRubricAudit } from '../../src/correction/domain/rubricAudit.ts';
import type { Rubric } from '../../src/correction/domain/rubric.ts';
import {
  cancelRubricAuditTask, getRubricAuditTask, launchRubricAuditTask,
  rubricAuditStorageKey, subscribeRubricAuditTask,
} from '../../src/correction/application/rubricAuditTask.ts';

const mocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock('../../src/correction/adapters/ai/rubricAuditOllama.ts', () => ({ auditRubricWithOllama: mocks.audit }));

const rubric: Rubric = { title: 'Mitose', criteria: [{ id: 'title', title: 'Titre principal', description: '', maxPoints: 2 }] };
const report = parseRubricAudit('{"issues":[]}', rubric, 'qwen-local');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let values: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mocks.audit.mockReset();
  values = new Map<string, string>();
  storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  vi.stubGlobal('window', { localStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

describe('vérification de barème indépendante de son écran', () => {
  it('garde une seule requête active après navigation, puis conserve le résultat', async () => {
    const pending = deferred<typeof report>();
    mocks.audit.mockReturnValue(pending.promise);
    const states: string[] = [];
    const stopListening = subscribeRubricAuditTask('assignment-progress', () => states.push(getRubricAuditTask('assignment-progress').state));
    const settings = { assignmentId: 'assignment-progress', rubric, endpoint: 'https://localhost:11435', model: 'qwen-local' };
    const first = launchRubricAuditTask(settings);
    await launchRubricAuditTask(settings);
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(getRubricAuditTask('assignment-progress')).toMatchObject({ state: 'running', phase: 'waiting' });
    stopListening(); // Simulates the teacher leaving the rubric screen for diagnostics.
    pending.resolve(report);
    await first;
    expect(getRubricAuditTask('assignment-progress')).toMatchObject({ state: 'success', report });
    expect(JSON.parse(values.get(rubricAuditStorageKey('assignment-progress')) ?? '{}')).toMatchObject({
      report: { model: 'qwen-local' }, decisions: [],
    });
    expect(states).toEqual(['running']);
  });

  it('transmet le réglage Thinking et le garde visible pendant la requête et après sa fin', async () => {
    const pending = deferred<typeof report>();
    mocks.audit.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(report);
    const config = { assignmentId: 'assignment-thinking', rubric, endpoint: 'http://localhost:11434', model: 'qwen-local' };
    const ongoing = launchRubricAuditTask({ ...config, thinking: true });
    expect(mocks.audit).toHaveBeenCalledWith(rubric, expect.objectContaining({ model: 'qwen-local', thinking: true }));
    expect(getRubricAuditTask(config.assignmentId)).toMatchObject({ state: 'running', thinking: true });
    pending.resolve(report);
    await ongoing;
    expect(getRubricAuditTask(config.assignmentId)).toMatchObject({ state: 'success', thinking: true });
    await launchRubricAuditTask({ ...config, thinking: false });
    expect(mocks.audit).toHaveBeenLastCalledWith(rubric, expect.objectContaining({ thinking: false }));
    expect(getRubricAuditTask(config.assignmentId)).toMatchObject({ state: 'success', thinking: false });
  });

  it('allows cancellation and ignores a late response without losing previous decisions', async () => {
    const pending = deferred<typeof report>();
    mocks.audit.mockReturnValue(pending.promise);
    const key = rubricAuditStorageKey('assignment-cancel');
    values.set(key, '{"existing":"previous audit"}');
    const first = launchRubricAuditTask({ assignmentId: 'assignment-cancel', rubric, endpoint: 'http://localhost:11434', model: 'qwen-local' });
    cancelRubricAuditTask('assignment-cancel');
    expect(getRubricAuditTask('assignment-cancel').state).toBe('canceled');
    pending.resolve(report); // Some providers ignore abort; this response must be discarded.
    await first;
    expect(getRubricAuditTask('assignment-cancel').state).toBe('canceled');
    expect(values.get(key)).toBe('{"existing":"previous audit"}');
  });

  it('publishes model errors, then permits a retry that completes', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValueOnce(report);
    const settings = { assignmentId: 'assignment-retry', rubric, endpoint: 'http://localhost:11434', model: 'qwen-local' };
    await launchRubricAuditTask(settings);
    expect(getRubricAuditTask('assignment-retry')).toMatchObject({ state: 'error', error: 'HTTP 503' });
    await launchRubricAuditTask(settings);
    expect(getRubricAuditTask('assignment-retry').state).toBe('success');
    expect(mocks.audit).toHaveBeenCalledTimes(2);
  });

  it('shows a persistence warning if local storage is unavailable, without hiding the report', async () => {
    mocks.audit.mockResolvedValue(report);
    storage.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    await launchRubricAuditTask({ assignmentId: 'assignment-storage', rubric, endpoint: 'http://localhost:11434', model: 'qwen-local' });
    expect(getRubricAuditTask('assignment-storage')).toMatchObject({
      state: 'success', report,
      storageWarning: expect.stringContaining('enregistrement local'),
    });
  });
  it('transmet la progression réelle du flux au panneau, y compris après une navigation', async () => {
    let finish!: (value: typeof report) => void;
    mocks.audit.mockImplementation((_rubric, settings) => {
      settings.onProgress?.({ phase: 'thinking', thinkingCharacters: 350, answerCharacters: 0, chunksReceived: 4, lastActivityAt: 1234 });
      settings.onProgress?.({ phase: 'generating', thinkingCharacters: 350, answerCharacters: 45, chunksReceived: 8, lastActivityAt: 1250, generatedTokens: 44 });
      return new Promise<typeof report>((resolve) => { finish = resolve; });
    });
    const id = 'assignment-streaming';
    const states: string[] = [];
    const unsubscribe = subscribeRubricAuditTask(id, () => {
      states.push(getRubricAuditTask(id).phase ?? getRubricAuditTask(id).state);
    });
    const ongoing = launchRubricAuditTask({ assignmentId: id, rubric, endpoint: 'http://localhost:11434', model: 'qwen-local', thinking: true });
    expect(getRubricAuditTask(id)).toMatchObject({
      state: 'running', phase: 'generating', thinkingCharacters: 350, answerCharacters: 45, chunksReceived: 8, generatedTokens: 44,
    });
    unsubscribe(); // Navigating away does not lose the server-observed progress.
    expect(getRubricAuditTask(id).phase).toBe('generating');
    finish(report);
    await ongoing;
    expect(getRubricAuditTask(id)).toMatchObject({ state: 'success', generatedTokens: 44 });
    expect(states).toContain('thinking');
    expect(states).toContain('generating');
  });

});

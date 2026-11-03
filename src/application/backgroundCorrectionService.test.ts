import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackgroundCorrectionService } from './backgroundCorrectionService.ts';
import type { BackgroundCorrectionRepository } from '../ports/backgroundCorrectionRepository.ts';
import type { OllamaGateway } from '../ports/correctionWorkspace.ts';
import type { OllamaSettings } from '../ports/aiProvider.ts';

const settings: OllamaSettings = {
  endpoint: 'http://localhost:11434',
  visionModel: 'qwen3.5:4b',
  analysisModel: 'qwen3.5:4b',
};

function createService() {
  const checkReady = vi.fn(async () => undefined);
  const prewarmModel = vi.fn(async () => undefined);
  const repository = {} as BackgroundCorrectionRepository;
  const workspace = {
    checkReady,
    prewarmModel,
  } as unknown as OllamaGateway;
  return {
    service: createBackgroundCorrectionService(repository, workspace),
    checkReady,
    prewarmModel,
  };
}

describe('background Ollama prewarming', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps one prewarmed reading model available for five minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T08:00:00.000Z'));
    const { service, checkReady, prewarmModel } = createService();

    await service.prewarm(settings);
    expect(checkReady).toHaveBeenCalledTimes(2);
    expect(prewarmModel).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4 * 60_000 + 59_000);
    await service.prewarm(settings);
    expect(prewarmModel).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await service.prewarm(settings);
    expect(prewarmModel).toHaveBeenCalledTimes(2);
  });

  it('skips a new prewarm as soon as foreground correction has priority', async () => {
    const { service, prewarmModel } = createService();

    await service.pauseAndWait();
    await service.prewarm(settings);

    expect(prewarmModel).not.toHaveBeenCalled();
  });
});

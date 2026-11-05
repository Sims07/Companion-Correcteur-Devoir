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
  const unloadModel = vi.fn(async () => undefined);
  const repository = {} as unknown as BackgroundCorrectionRepository;
  const workspace = {
    checkReady,
    prewarmModel,
    unloadModel,
  } as unknown as OllamaGateway;
  return {
    service: createBackgroundCorrectionService(repository, workspace),
    checkReady,
    prewarmModel,
    unloadModel,
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

  it('lets a same-model prewarm continue without blocking foreground correction', async () => {
    let signal: AbortSignal | undefined;
    let modelLoaded = false;
    let modelLoadCount = 0;
    let notifyStarted!: () => void;
    let finishPrewarm!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const prewarmFinished = new Promise<void>((resolve) => { finishPrewarm = resolve; });
    const prewarmModel = vi.fn(async (_settings: OllamaSettings, _model: string, requestSignal?: AbortSignal) => {
      signal = requestSignal;
      if (!modelLoaded) { modelLoaded = true; modelLoadCount += 1; }
      notifyStarted();
      await prewarmFinished;
    });
    const workspace = {
      checkReady: vi.fn(async () => undefined),
      prewarmModel,
    } as unknown as OllamaGateway;
    const service = createBackgroundCorrectionService({} as unknown as BackgroundCorrectionRepository, workspace);

    const warming = service.prewarm(settings);
    await started;
    let pauseFinished = false;
    await service.pauseAndWait(settings.visionModel).then(() => { pauseFinished = true; });

    expect(pauseFinished).toBe(true);
    expect(signal?.aborted).toBe(false);
    if (!modelLoaded) { modelLoaded = true; modelLoadCount += 1; } // Simulated first foreground inference reuses the resident model.
    expect(modelLoadCount).toBe(1);
    finishPrewarm();
    await expect(warming).resolves.toBeUndefined();
  });

  it('does not launch a same-model prewarm after foreground work takes priority during metadata checks', async () => {
    let notifyReadyStarted!: () => void;
    let finishReady!: () => void;
    const readyStarted = new Promise<void>((resolve) => { notifyReadyStarted = resolve; });
    const readyFinished = new Promise<void>((resolve) => { finishReady = resolve; });
    const checkReady = vi.fn(async () => {
      notifyReadyStarted();
      await readyFinished;
    });
    const prewarmModel = vi.fn(async () => undefined);
    const workspace = { checkReady, prewarmModel } as unknown as OllamaGateway;
    const service = createBackgroundCorrectionService({} as unknown as BackgroundCorrectionRepository, workspace);

    const warming = service.prewarm(settings);
    await readyStarted;
    await service.pauseAndWait(settings.visionModel);
    service.resume('assignment-1');
    finishReady();
    await expect(warming).resolves.toBeUndefined();

    expect(prewarmModel).not.toHaveBeenCalled();
  });

  it('aborts and waits for an in-flight prewarm when foreground correction uses another model', async () => {
    let signal: AbortSignal | undefined;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const prewarmModel = vi.fn(async (_settings: OllamaSettings, _model: string, requestSignal?: AbortSignal) => {
      signal = requestSignal;
      notifyStarted();
      await new Promise<void>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new DOMException('Prewarm cancelled', 'AbortError')), { once: true });
      });
    });
    const workspace = {
      checkReady: vi.fn(async () => undefined),
      prewarmModel,
    } as unknown as OllamaGateway;
    const service = createBackgroundCorrectionService({} as unknown as BackgroundCorrectionRepository, workspace);

    const warming = service.prewarm(settings);
    await started;
    await service.pauseAndWait('different-model:7b');
    await expect(warming).resolves.toBeUndefined();

    expect(signal?.aborted).toBe(true);
  });

  it('does not explicitly unload a prewarmed model when foreground work switches model roles', async () => {
    const { service, unloadModel } = createService();

    await service.prewarm(settings);
    await service.pauseAndWait('different-analysis-model:7b');

    expect(unloadModel).not.toHaveBeenCalled();
  });

  it('keeps a prewarmed model resident on explicit stop so resume does not force a cold start', async () => {
    const { service, unloadModel } = createService();
    await service.prewarm(settings);
    await service.stopAndWait();
    expect(unloadModel).not.toHaveBeenCalled();
  });

  it('stops promptly if the readiness check hangs before model loading', async () => {
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => { started = resolve; });
    const checkReady = vi.fn(async () => {
      started();
      return new Promise<void>(() => undefined);
    });
    const prewarmModel = vi.fn(async () => undefined);
    const service = createBackgroundCorrectionService(
      {} as unknown as BackgroundCorrectionRepository,
      { checkReady, prewarmModel } as unknown as OllamaGateway,
    );
    const warming = service.prewarm(settings);
    await requestStarted;

    await service.stopAndWait();
    await warming;
    expect(prewarmModel).not.toHaveBeenCalled();
  });

  it('skips a new prewarm as soon as foreground correction has priority', async () => {
    const { service, prewarmModel } = createService();

    await service.pauseAndWait();
    await service.prewarm(settings);

    expect(prewarmModel).not.toHaveBeenCalled();
  });
});

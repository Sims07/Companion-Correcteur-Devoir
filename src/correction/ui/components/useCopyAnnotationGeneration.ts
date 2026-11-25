import { useEffect, useRef, useState } from 'react';
import type { CopyAnnotation } from '../../domain/copyAnnotationFeature.ts';
import type { CopyAnnotationGenerationPhase } from '../../ports/correctionWorkspace.ts';

export type AnnotationGenerationState =
  | { status: 'idle' | 'cancelled' }
  | { status: 'running'; phase: CopyAnnotationGenerationPhase; startedAt: number }
  | { status: 'done'; count: number }
  | { status: 'error'; message: string };

export function useCopyAnnotationGeneration(scope: unknown) {
  const [state, setState] = useState<AnnotationGenerationState>({ status: 'idle' });
  const running = useRef<AbortController | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;

  useEffect(() => {
    setState({ status: 'idle' });
    return () => {
      running.current?.abort();
      running.current = null;
    };
  }, [scope]);

  async function start(
    generate: (signal: AbortSignal, onPhase: (phase: CopyAnnotationGenerationPhase) => void) => Promise<CopyAnnotation[]>,
    complete: (annotations: CopyAnnotation[]) => number,
  ) {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    const startedAt = Date.now();
    const active = () => scope === currentScope.current && running.current === controller && !controller.signal.aborted;
    const onPhase = (phase: CopyAnnotationGenerationPhase) => {
      if (active()) setState({ status: 'running', phase, startedAt });
    };
    onPhase('preparing');
    try {
      const result = await generate(controller.signal, onPhase);
      if (active()) setState({ status: 'done', count: complete(result) });
    } catch (cause) {
      if (active()) setState({ status: 'error', message: cause instanceof Error ? cause.message : 'La génération a échoué.' });
    } finally {
      if (running.current === controller) running.current = null;
    }
  }

  function cancel() {
    if (!running.current) return;
    running.current.abort();
    running.current = null;
    setState({ status: 'cancelled' });
  }

  return { state, start, cancel };
}

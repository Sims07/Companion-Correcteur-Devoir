import type { ImageInput } from '../ports/aiProvider.ts';

export interface QueuedCopy {
  id: string;
  label: string;
  images: ImageInput[];
}

export function appendQueuedCopy(queue: readonly QueuedCopy[], copy: QueuedCopy): QueuedCopy[] {
  return [...queue, copy];
}

export function takeNextQueuedCopy(queue: readonly QueuedCopy[]): { next: QueuedCopy | null; remaining: QueuedCopy[] } {
  if (queue.length === 0) return { next: null, remaining: [] };
  return { next: queue[0], remaining: queue.slice(1) };
}

import type { ImageInput } from '../ports/aiProvider.ts';
import type { TeacherAnnotationInkColor } from './teacherAnnotationColor.ts';

export interface QueuedCopy {
  id: string;
  label: string;
  images: ImageInput[];
  originalImages?: ImageInput[];
  detectTeacherAnnotations?: boolean;
  annotationInkColor?: TeacherAnnotationInkColor;
  annotationInkColorApplied?: boolean;
}

export function appendQueuedCopy(queue: readonly QueuedCopy[], copy: QueuedCopy): QueuedCopy[] {
  return [...queue, copy];
}

export function takeNextQueuedCopy(queue: readonly QueuedCopy[]): { next: QueuedCopy | null; remaining: QueuedCopy[] } {
  if (queue.length === 0) return { next: null, remaining: [] };
  return { next: queue[0], remaining: queue.slice(1) };
}

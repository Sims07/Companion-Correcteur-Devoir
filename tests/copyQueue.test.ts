import { describe, expect, it } from 'vitest';
import { appendQueuedCopy, takeNextQueuedCopy, type QueuedCopy } from '../src/domain/copyQueue.ts';

const copy = (id: string): QueuedCopy => ({
  id,
  label: `Étudiant ${id}`,
  images: [{ fileName: `${id}.png`, mimeType: 'image/png', base64: 'cG5n' }],
  detectTeacherAnnotations: id === '1',
  annotationInkColor: id === '1' ? 'red' : 'none',
  annotationInkColorApplied: id === '1',
});

describe('local copy queue', () => {
  it('adds copies to the end of the queue without reordering earlier copies', () => {
    expect(appendQueuedCopy([copy('1')], copy('2')).map((item) => item.id)).toEqual(['1', '2']);
  });

  it('takes the next copy and preserves the remaining order', () => {
    const result = takeNextQueuedCopy([copy('1'), copy('2'), copy('3')]);
    expect(result.next?.id).toBe('1');
    expect(result.next?.detectTeacherAnnotations).toBe(true);
    expect(result.next?.annotationInkColor).toBe('red');
    expect(result.next?.annotationInkColorApplied).toBe(true);
    expect(result.remaining[0]?.detectTeacherAnnotations).toBe(false);
    expect(result.remaining.map((item) => item.id)).toEqual(['2', '3']);
  });

  it('handles an empty queue safely', () => {
    expect(takeNextQueuedCopy([])).toEqual({ next: null, remaining: [] });
  });
});

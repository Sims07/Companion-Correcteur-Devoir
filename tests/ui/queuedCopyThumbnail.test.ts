import { describe, expect, it } from 'vitest';
import { queuedCopyThumbnailDimensions } from '../../src/ui/queuedCopyThumbnail.ts';

describe('memory-bounded batch page thumbnails', () => {
  it('preserves tiny scientific diagrams without unnecessary resampling', () => {
    expect(queuedCopyThumbnailDimensions(8, 4)).toEqual({ width: 8, height: 4 });
    expect(queuedCopyThumbnailDimensions(4, 8)).toEqual({ width: 4, height: 8 });
  });

  it('caps both portrait and landscape images while preserving their aspect ratios', () => {
    expect(queuedCopyThumbnailDimensions(8000, 4000)).toEqual({ width: 420, height: 210 });
    expect(queuedCopyThumbnailDimensions(1000, 2000)).toEqual({ width: 210, height: 420 });
    expect(queuedCopyThumbnailDimensions(4000, 4000)).toEqual({ width: 420, height: 420 });
  });

  it('never creates a zero-sized preview', () => {
    expect(queuedCopyThumbnailDimensions(1, 20_000)).toEqual({ width: 1, height: 420 });
    expect(queuedCopyThumbnailDimensions(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

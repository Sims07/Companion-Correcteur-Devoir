import { describe, expect, it } from 'vitest';
import { inspectFraming, targetRegion } from '../../src/evaluation/ui/components/zoomWitness.ts';

describe('zoom witness framing', () => {
  it('distinguishes exact, off-target, too broad and truncated crops', () => {
    expect(inspectFraming(targetRegion).coverage).toBeCloseTo(1);
    expect(inspectFraming(targetRegion).occupancy).toBeCloseTo(1);
    expect(inspectFraming({ ...targetRegion, x: 0.1 }).coverage).toBe(0);
    const broad = inspectFraming({ ...targetRegion, width: 0.24 });
    expect(broad.coverage).toBeCloseTo(1);
    expect(broad.occupancy).toBeCloseTo(0.5);
    expect(inspectFraming({ ...targetRegion, width: 0.06 }).coverage).toBeCloseTo(0.5);
  });
});

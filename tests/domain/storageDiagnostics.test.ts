import { describe, expect, it } from 'vitest';
import {
  approximateValueBytes, formatStorageBytes, storageOccupancyPercent, storageStoreLabel,
} from '../../src/domain/storageDiagnostics.ts';

describe('local storage diagnostic measurements', () => {
  it('computes a bounded percentage only with a valid browser estimate', () => {
    expect(storageOccupancyPercent(20, 100)).toBe(20);
    expect(storageOccupancyPercent(125, 100)).toBe(100);
    expect(storageOccupancyPercent(null, 100)).toBeNull();
    expect(storageOccupancyPercent(100, 0)).toBeNull();
    expect(storageOccupancyPercent(100, null)).toBeNull();
    expect(storageOccupancyPercent(-1, 100)).toBeNull();
  });

  it('labels data categories clearly without inventing a physical byte count', () => {
    expect(storageStoreLabel('model-evaluations')).toBe('Évaluations de modèles');
    expect(storageStoreLabel('local-corrections')).toBe('Copies et corrections');
    expect(storageStoreLabel('diagnostic-history')).toBe('Traces techniques');
    expect(storageStoreLabel('new-store')).toBe('Autres données locales');
    expect(formatStorageBytes(null)).toBe('Non disponible');
    expect(formatStorageBytes(0)).toBe('0 o');
    expect(formatStorageBytes(1024)).toContain('Ko');
    expect(formatStorageBytes(1024 ** 2)).toContain('Mo');
  });

  it('estimates nested image and raw-response text without JSON serialization or repeated references', () => {
    const image = { base64: 'QUJDREVG'.repeat(1024), mimeType: 'image/jpeg' };
    const evaluated = { images: [image], diagnostics: { response: 'Données étudiantes', count: 1 } };
    const expectedMinimum = image.base64.length * 2;
    expect(approximateValueBytes(evaluated)).toBeGreaterThan(expectedMinimum);
    expect(approximateValueBytes({ twice: [image, image] })).toBeLessThan(expectedMinimum * 2 + 100);
    expect(approximateValueBytes(new Uint8Array(12))).toBe(12);
  });

  it('remains safe for cyclic objects and very deep records', () => {
    const recursive: { self?: unknown; note: string } = { note: 'test' };
    recursive.self = recursive;
    expect(approximateValueBytes(recursive)).toBeGreaterThan(0);
    expect(Number.isFinite(approximateValueBytes(recursive))).toBe(true);
  });
});

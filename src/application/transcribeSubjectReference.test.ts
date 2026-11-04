import { describe, expect, it, vi } from 'vitest';
import { transcribeSubjectReference } from './transcribeSubjectReference.ts';
import type { GradingProvider } from '../ports/aiProvider.ts';

const images = [{ base64: 'c3VqZXQ=', mimeType: 'image/png', fileName: 'sujet-1.png' }];

describe('subject reference transcription before scoring', () => {
  it('uses only the dedicated subject reading step, without student OCR or grading', async () => {
    const generate = vi.fn<GradingProvider['generate']>(async (request) => {
      expect(request.subjectOnly).toBe(true);
      expect(request.visionOnly).toBe(true);
      expect(request.subjectImages).toEqual(images);
      expect(request.images).toEqual(images);
      return 'Question 1 : expliquer la mitose.';
    });
    const provider: GradingProvider = { id: 'vision', generate };
    await expect(transcribeSubjectReference(provider, images)).resolves.toBe('Question 1 : expliquer la mitose.');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or empty reference rather than scoring an unspecified question', async () => {
    const provider: GradingProvider = { id: 'vision', generate: vi.fn(async () => '  ') };
    await expect(transcribeSubjectReference(provider, [])).rejects.toThrow('Importez le sujet');
    await expect(transcribeSubjectReference(provider, images)).rejects.toThrow('n’a pas pu être lu');
  });
});

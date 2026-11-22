import { describe, expect, it } from 'vitest';
import { explainLmStudioContextLoadError } from '../../src/shared/domain/lmStudioContextLoadError.ts';

describe('LM Studio MLX context loading errors', () => {
  it('explains AutoFit below a model minimum without proposing a too-small context', () => {
    const response = JSON.stringify({ error: { message:
      'Failed to load model "qwen3-vl-32b-instruct-mlx". Error: MLX AutoFit selected a context length of 11776, below the required minimum of 16384.' } });
    const description = explainLmStudioContextLoadError(response);
    expect(description).toContain('11\u202f776');
    expect(description).toContain('16\u202f384');
    expect(description).toContain('libérer de la mémoire');
    expect(description).not.toContain('4096 tokens');
  });
  it('does not misdiagnose unrelated server errors', () => {
    expect(explainLmStudioContextLoadError('Model does not expose reasoning configuration')).toBeNull();
    expect(explainLmStudioContextLoadError('MLX AutoFit selected a context length of 16384, below the required minimum of 16384')).toBeNull();
  });
});

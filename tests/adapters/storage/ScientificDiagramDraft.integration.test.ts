import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  loadScientificDiagramDraft, saveScientificDiagramDraft, clearScientificDiagramDraft,
} from '../../../src/shared/adapters/storage/scientificDiagramDraft.ts';

const photo = { mimeType: 'image/png', base64: 'PRIVATE_STUDENT_IMAGE', fileName: 'copie.png' };

describe('brouillons locaux des schémas scientifiques (IndexedDB)', () => {
  it('restores private image bytes, teacher rubric and context after an interrupted correction', async () => {
    await clearScientificDiagramDraft('personal-lab');
    const draft = {
      images: [photo], rubric: { title: 'Barème enseignant', criteria: [] },
      context: 'Mitose végétale', repetitions: 1, gold: { 'title::below': 'absent' },
      methodSelection: 'direct-image-generative',
    };
    await saveScientificDiagramDraft('personal-lab', draft);
    // Simulate an AI failure and a full React remount: the draft is independent
    // from any model response and no teacher copy leaves the browser.
    const recovered = await loadScientificDiagramDraft<typeof draft>('personal-lab');
    expect(recovered).toEqual(draft);
    expect(JSON.stringify(recovered)).not.toMatch(/apiKey|endpoint|bearer/i);
    await clearScientificDiagramDraft('personal-lab');
    expect(await loadScientificDiagramDraft('personal-lab')).toBeNull();
  });

  it('isolates direct-teacher and laboratory drafts and overwrites older pages', async () => {
    await clearScientificDiagramDraft('teacher-direct');
    await clearScientificDiagramDraft('personal-lab');
    await saveScientificDiagramDraft('teacher-direct', { images: [photo], question: 'Cellule végétale' });
    await saveScientificDiagramDraft('personal-lab', { images: [photo, photo], context: 'Test' });
    expect((await loadScientificDiagramDraft<{ images: typeof photo[] }>('teacher-direct'))?.images).toHaveLength(1);
    expect((await loadScientificDiagramDraft<{ images: typeof photo[] }>('personal-lab'))?.images).toHaveLength(2);

    await saveScientificDiagramDraft('teacher-direct', { images: [], question: 'Nouveau devoir' });
    expect((await loadScientificDiagramDraft<{ images: typeof photo[] }>('teacher-direct'))?.images).toEqual([]);
    expect((await loadScientificDiagramDraft<{ images: typeof photo[] }>('personal-lab'))?.images).toHaveLength(2);
    await clearScientificDiagramDraft('teacher-direct');
    await clearScientificDiagramDraft('personal-lab');
  });
});

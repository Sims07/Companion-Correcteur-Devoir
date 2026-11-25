import { expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCopyAnnotationPdf } from '../../src/correction/adapters/files/copyAnnotationPdf.ts';

const image = { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', mimeType: 'image/png' };

it('exports the score, appreciation, every image page and only accepted remarks', async () => {
  const pdf = createCopyAnnotationPdf({
    assignmentTitle: 'Étude de la membrane', studentLabel: 'Copie 1', score: 1.67, maximum: 2, finalized: true,
    appreciation: 'Très bon dessin !', images: [image, image],
    annotations: [
      { id: 'one', message: 'Souligne le titre.', status: 'accepted', placement: { pageNumber: 2, x: 300, y: 700 } },
      { id: 'two', message: 'Excellente légende.', status: 'accepted' },
      { id: 'three', message: 'Suggestion privée.', status: 'suggested', placement: { pageNumber: 1, x: 500, y: 500 } },
    ],
  });
  expect(pdf.type).toBe('application/pdf');
  const document = getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), useSystemFonts: true });
  try {
    const loaded = await document.promise;
    expect(loaded.numPages).toBe(3);
    const text = async (number: number) => (await (await loaded.getPage(number)).getTextContent()).items
      .flatMap((item) => 'str' in item ? [item.str] : []).join(' ');
    expect(await text(1)).toContain('Note validée : 1,67 / 2');
    expect(await text(1)).toContain('Très bon dessin !');
    expect(await text(1)).toContain('Page 2 · Souligne le titre.');
    expect(await text(1)).toContain('Excellente légende.');
    expect(await text(1)).not.toContain('Suggestion privée.');
    expect((await text(2)).trim()).toBe('Copie · page 1 / 2');
    expect((await text(3)).trim()).toBe('Copie · page 2 / 2  1');
  } finally {
    await document.destroy();
  }
});

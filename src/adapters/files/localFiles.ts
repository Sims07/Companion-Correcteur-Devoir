import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ImageInput } from '../../ports/aiProvider.ts';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 10;

function dataUrlToImage(dataUrl: string, fileName: string): ImageInput {
  const separator = dataUrl.indexOf(',');
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
  return { mimeType, base64: dataUrl.slice(separator + 1), fileName };
}

function readImage(file: File): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Impossible de lire le fichier « ${file.name} ».`));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Format illisible pour « ${file.name} ».`));
        return;
      }
      resolve(dataUrlToImage(reader.result, file.name));
    };
    reader.readAsDataURL(file);
  });
}

async function renderPdf(file: File): Promise<ImageInput[]> {
  const pdfDocument = await getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdfDocument.numPages > MAX_PDF_PAGES) {
    const pageCount = pdfDocument.numPages;
    await pdfDocument.destroy();
    throw new Error(`Le PDF « ${file.name} » contient ${pageCount} pages. La limite locale est de ${MAX_PDF_PAGES} pages par fichier.`);
  }
  const images: ImageInput[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Le navigateur ne permet pas de préparer les pages PDF localement.');
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push(dataUrlToImage(canvas.toDataURL('image/png'), `${file.name} · page ${pageNumber}`));
      page.cleanup();
    }
  } finally {
    await pdfDocument.destroy();
  }
  return images;
}

/** Converts accepted files to local image payloads; nothing is uploaded by this function. */
export async function prepareLocalFiles(files: FileList | File[]): Promise<ImageInput[]> {
  const selected = Array.from(files);
  if (selected.length === 0) return [];
  const images: ImageInput[] = [];
  for (const file of selected) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`« ${file.name} » dépasse la limite de 15 Mo.`);
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      images.push(...await renderPdf(file));
    } else if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      images.push(await readImage(file));
    } else {
      throw new Error(`Format non pris en charge pour « ${file.name} ». Utilisez JPG, PNG, WebP ou PDF.`);
    }
  }
  return images;
}

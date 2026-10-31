import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ImageInput } from '../../ports/aiProvider.ts';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 10;
const MAX_IMAGE_SIDE = 1300;
const JPEG_QUALITY = 0.85;

function canvasToJpeg(canvas: HTMLCanvasElement, fileName: string): ImageInput {
  return dataUrlToImage(canvas.toDataURL('image/jpeg', JPEG_QUALITY), fileName);
}

async function prepareImage(file: File): Promise<ImageInput> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne permet pas de préparer les images localement.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvasToJpeg(canvas, file.name);
  } finally {
    bitmap.close();
  }
}

function dataUrlToImage(dataUrl: string, fileName: string): ImageInput {
  const separator = dataUrl.indexOf(',');
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
  return { mimeType, base64: dataUrl.slice(separator + 1), fileName };
}


async function renderPdf(file: File): Promise<ImageInput[]> {
  const loadingTask = getDocument({ data: await file.arrayBuffer() });
  const pdfDocument = await loadingTask.promise;
  if (pdfDocument.numPages > MAX_PDF_PAGES) {
    const pageCount = pdfDocument.numPages;
    await loadingTask.destroy();
    throw new Error(`Le PDF « ${file.name} » contient ${pageCount} pages. La limite locale est de ${MAX_PDF_PAGES} pages par fichier.`);
  }
  const images: ImageInput[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.6, MAX_IMAGE_SIDE / Math.max(initialViewport.width, initialViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Le navigateur ne permet pas de préparer les pages PDF localement.');
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push(canvasToJpeg(canvas, `${file.name} · page ${pageNumber}`));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return images;
}

/** Rotate only the working copy. The caller keeps its original ImageInput unchanged. */
export async function rotateLocalImage(image: ImageInput, clockwiseDegrees: 90 | 180 | 270): Promise<ImageInput> {
  const binary = Uint8Array.from(atob(image.base64), (character) => character.charCodeAt(0));
  const blob = new Blob([binary], { type: image.mimeType });
  const bitmap = await createImageBitmap(blob);
  try {
    const quarterTurn = clockwiseDegrees === 90 || clockwiseDegrees === 270;
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = quarterTurn ? bitmap.height : bitmap.width;
    canvas.height = quarterTurn ? bitmap.width : bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne permet pas de faire pivoter cette image localement.');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(clockwiseDegrees * Math.PI / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return canvasToJpeg(canvas, image.fileName ?? 'page tournée');
  } finally {
    bitmap.close();
  }
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
      images.push(await prepareImage(file));
    } else {
      throw new Error(`Format non pris en charge pour « ${file.name} ». Utilisez JPG, PNG, WebP ou PDF.`);
    }
  }
  return images;
}

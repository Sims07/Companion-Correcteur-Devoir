import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ImageInput } from '../../ports/aiProvider.ts';
import { eraseTeacherInkPixels, sampleTeacherPaperColor, type TeacherAnnotationInkColor } from '../../domain/teacherAnnotationColor.ts';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 10;

/** Encode bytes without changing the original image data or its dimensions. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function dataUrlToImage(dataUrl: string, fileName: string): ImageInput {
  const separator = dataUrl.indexOf(',');
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
  return { mimeType, base64: dataUrl.slice(separator + 1), fileName };
}

/**
 * Keep JPEG and PNG files byte-for-byte unchanged. WebP is converted to PNG
 * because Ollama image support is more consistent for PNG/JPEG; PNG encoding
 * preserves every decoded source pixel and never applies lossy compression.
 */
async function prepareImage(file: File): Promise<ImageInput> {
  if (file.type === 'image/jpeg' || file.type === 'image/png') {
    return { mimeType: file.type, base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), fileName: file.name };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne permet pas de préparer les images localement.');
    context.drawImage(bitmap, 0, 0);
    return dataUrlToImage(canvas.toDataURL('image/png'), file.name);
  } finally {
    bitmap.close();
  }
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
      const scale = Math.min(1.6, 1300 / Math.max(initialViewport.width, initialViewport.height));
      const viewport = page.getViewport({ scale });
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
    await loadingTask.destroy();
  }
  return images;
}

/**
 * Rotate only the working copy. PNG encoding is lossless: no JPEG recompression,
 * no resizing, and no change to the source ImageInput kept by the caller.
 */
export async function rotateLocalImage(image: ImageInput, clockwiseDegrees: 90 | 180 | 270): Promise<ImageInput> {
  const decoded = atob(image.base64);
  const binary = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) binary[index] = decoded.charCodeAt(index);
  const blob = new Blob([binary.buffer as ArrayBuffer], { type: image.mimeType });
  const bitmap = await createImageBitmap(blob);
  try {
    const quarterTurn = clockwiseDegrees === 90 || clockwiseDegrees === 270;
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = quarterTurn ? bitmap.height : bitmap.width;
    canvas.height = quarterTurn ? bitmap.width : bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne permet pas de faire pivoter cette image localement.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(clockwiseDegrees * Math.PI / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return dataUrlToImage(canvas.toDataURL('image/png'), image.fileName ?? 'page tournée');
  } finally {
    bitmap.close();
  }
}


/** Erase selected professor ink locally on a working image; the caller keeps the untouched original. */
export async function eraseTeacherAnnotationColor(image: ImageInput, color: Exclude<TeacherAnnotationInkColor, 'none'>): Promise<ImageInput> {
  const decoded = atob(image.base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: image.mimeType }));
  try {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Le navigateur ne permet pas de retirer les annotations localement.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const paper = sampleTeacherPaperColor(frame.data, canvas.width, canvas.height);
    frame.data.set(eraseTeacherInkPixels(frame.data, paper, color));
    context.putImageData(frame, 0, 0);
    return dataUrlToImage(canvas.toDataURL('image/png'), image.fileName ?? 'page nettoyée');
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

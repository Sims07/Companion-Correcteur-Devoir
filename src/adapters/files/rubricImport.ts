import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as mammoth from 'mammoth';
import { readSheet } from 'read-excel-file/browser';
import { validateRubric, type Rubric, type RubricCriterion } from '../../domain/rubric.ts';
import type { ImportedRubric } from '../../ports/correctionWorkspace.ts';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function slugify(value: string, index: number): string {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `critere-${index + 1}`;
}

function rubricFromJson(value: unknown, fileName: string): ImportedRubric {
  if (!value || typeof value !== 'object') throw new Error('Le JSON ne contient pas un barème valide.');
  const source = value as Record<string, unknown>;
  const rawCriteria = source.criteria ?? source.criteres ?? source.rubric;
  if (!Array.isArray(rawCriteria)) throw new Error('Le JSON doit contenir une liste « criteria » (ou « criteres »).');
  const criteria: RubricCriterion[] = rawCriteria.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Le critère ${index + 1} est invalide.`);
    const criterion = item as Record<string, unknown>;
    const title = String(criterion.title ?? criterion.titre ?? criterion.name ?? '').trim();
    const points = Number(criterion.maxPoints ?? criterion.max_points ?? criterion.points ?? criterion.maximum);
    if (!title || !Number.isFinite(points) || points < 0) throw new Error(`Le critère ${index + 1} doit avoir un titre et un maximum de points valide.`);
    return {
      id: String(criterion.id ?? slugify(title, index)),
      title,
      description: String(criterion.description ?? criterion.attendus ?? criterion.details ?? ''),
      maxPoints: points,
    };
  });
  const rubric: Rubric = { title: String(source.title ?? source.titre ?? fileName.replace(/\.[^.]+$/, '')).trim(), criteria };
  const validation = validateRubric(rubric);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return { rubric, warnings: [] };
}

function parseDelimitedRows(text: string): string[][] {
  const delimiter = text.split(/\r?\n/, 1)[0]?.includes(';') ? ';' : ',';
  return text.split(/\r?\n/).map((line) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === delimiter && !quoted) { cells.push(cell.trim()); cell = ''; }
      else cell += character;
    }
    cells.push(cell.trim());
    return cells;
  }).filter((row) => row.some((cell) => cell.length > 0));
}

function rubricFromRows(rows: string[][], title: string): ImportedRubric {
  if (!rows.length) throw new Error('Aucun critère n’a été trouvé dans le fichier.');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const header = rows[0].map(normalize);
  const titleIndex = header.findIndex((cell) => /^(critere|criteria|titre|title|nom|name)$/.test(cell));
  const pointsIndex = header.findIndex((cell) => /^(points|max ?points|points max|maximum|bareme|bareme points|note max)$/.test(cell));
  const descriptionIndex = header.findIndex((cell) => /^(description|attendus|details|indications|commentaire)$/.test(cell));
  const hasHeader = titleIndex >= 0 && pointsIndex >= 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const nameCol = hasHeader ? titleIndex : 0;
  const pointsCol = hasHeader ? pointsIndex : 1;
  const descCol = hasHeader ? descriptionIndex : 2;
  const criteria: RubricCriterion[] = [];
  for (const row of dataRows) {
    const criterionTitle = row[nameCol]?.trim();
    const pointsText = row[pointsCol]?.replace(',', '.').replace(/\s*(pts?|points?)\s*$/i, '').trim();
    const points = Number(pointsText);
    if (!criterionTitle || !pointsText || !Number.isFinite(points) || points < 0) continue;
    criteria.push({ id: slugify(criterionTitle, criteria.length), title: criterionTitle, description: descCol >= 0 ? row[descCol] ?? '' : '', maxPoints: points });
  }
  if (!criteria.length) return rubricFromText(rows.map((row) => row.join(' — ')).join('\n'), title);
  return { rubric: { title, criteria }, warnings: [] };
}

function rubricFromText(text: string, title: string): ImportedRubric {
  const criteria: RubricCriterion[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const patterns = [
    /^(.+?)\s*(?:[:;|—–-])\s*(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\s*$/i,
    /^(.+?)\s*\((\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\)\s*$/i,
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\s*$/i,
  ];
  for (const line of lines) {
    let match: RegExpMatchArray | null = null;
    for (const pattern of patterns) { match = line.match(pattern); if (match) break; }
    if (!match) continue;
    const criterionTitle = match[1].trim().replace(/^[-•*\d.)\s]+/, '');
    const points = Number(match[2].replace(',', '.'));
    if (!criterionTitle || !Number.isFinite(points) || points < 0) continue;
    criteria.push({ id: slugify(criterionTitle, criteria.length), title: criterionTitle, description: '', maxPoints: points });
  }
  if (!criteria.length) {
    throw new Error('Aucun critère avec points n’a été détecté. Utilisez un tableau avec les colonnes « Critère » et « Points max », ou un JSON de barème. Les PDF scannés nécessitent une étape OCR.');
  }
  warnings.push('Import automatique à vérifier : les descriptions détaillées et les sous-critères peuvent nécessiter une reprise manuelle.');
  return { rubric: { title, criteria }, warnings };
}

async function extractPdfText(file: File): Promise<string> {
  const task = getDocument({ data: await file.arrayBuffer() });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const lines = new Map<number, string[]>();
      for (const item of content.items) {
        if (!('str' in item) || !('transform' in item)) continue;
        const y = Math.round(item.transform[5]);
        const line = lines.get(y) ?? [];
        line.push(item.str);
        lines.set(y, line);
      }
      pages.push(`[PAGE ${number} / ${pdf.numPages}]\n${[...lines.entries()].sort(([left], [right]) => right - left).map(([, words]) => words.join(' ')).join('\n')}`);
      page.cleanup();
    }
    return pages.join('\n');
  } finally {
    await task.destroy();
  }
}

/** Extracts text locally so it can be interpreted by the explicitly configured local Ollama model. */
export async function extractRubricText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Le fichier de barème dépasse la limite de 15 Mo.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  let text: string;
  if (extension === 'pdf') text = await extractPdfText(file);
  else if (extension === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else if (extension === 'txt' || extension === 'md') text = await file.text();
  else throw new Error('L’extraction IA textuelle prend en charge PDF, DOCX, TXT et Markdown.');
  if (!text.trim()) {
    throw new Error('Aucun texte n’a pu être extrait de ce document. S’il s’agit d’un scan, utilisez « importer une photo / un scan du barème » pour lancer la lecture visuelle locale.');
  }
  return text.trim();
}

/** Extracts rubric content in-browser. No file is uploaded or sent to an AI service. */
export async function importRubricFile(file: File): Promise<ImportedRubric> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Le fichier de barème dépasse la limite de 15 Mo.');
  const name = file.name.replace(/\.[^.]+$/, '').trim() || 'Barème importé';
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'json') return rubricFromJson(JSON.parse(await file.text()) as unknown, file.name);
  if (extension === 'pdf') return rubricFromText(await extractPdfText(file), name);
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return rubricFromText(result.value, name);
  }
  if (extension === 'xlsx') {
    const rows = await readSheet(file);
    return rubricFromRows(rows.map((row) => row.map((cell) => cell == null ? '' : String(cell))), name);
  }
  if (extension === 'csv') return rubricFromRows(parseDelimitedRows(await file.text()), name);
  if (extension === 'txt' || extension === 'md') return rubricFromText(await file.text(), name);
  throw new Error('Format non pris en charge. Utilisez PDF, DOCX, XLSX, CSV, TXT, MD ou JSON.');
}

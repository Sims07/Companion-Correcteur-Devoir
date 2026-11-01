import { readSheet } from 'read-excel-file/browser';
import { validateRubric, type Rubric, type RubricCriterion } from '../../domain/rubric.ts';
import type { ImportedRubric } from '../../ports/correctionWorkspace.ts';

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
    if (!title || !Number.isFinite(points)) throw new Error(`Le critère ${index + 1} doit avoir un titre et un maximum de points valide.`);
    return { id: String(criterion.id ?? slugify(title, index)), title, description: String(criterion.description ?? criterion.attendus ?? criterion.details ?? ''), maxPoints: points };
  });
  const rubric: Rubric = { title: String(source.title ?? source.titre ?? fileName.replace(/\.[^.]+$/, '')).trim(), criteria };
  const validation = validateRubric(rubric);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return { rubric, warnings: [] };
}
function parseDelimitedRows(text: string): string[][] {
  const delimiter = text.split(/\r?\n/, 1)[0]?.includes(';') ? ';' : ',';
  return text.split(/\r?\n/).map((line) => {
    const cells: string[] = []; let cell = ''; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === delimiter && !quoted) { cells.push(cell.trim()); cell = ''; }
      else cell += character;
    }
    cells.push(cell.trim()); return cells;
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
  const nameCol = hasHeader ? titleIndex : 0, pointsCol = hasHeader ? pointsIndex : 1, descCol = hasHeader ? descriptionIndex : 2;
  const criteria: RubricCriterion[] = [];
  for (const row of dataRows) {
    const criterionTitle = row[nameCol]?.trim();
    const pointsText = row[pointsCol]?.replace(',', '.').replace(/\s*(?:pts?|points?)\s*$/i, '').trim();
    const points = Number(pointsText);
    if (!criterionTitle || !pointsText || !Number.isFinite(points)) continue;
    criteria.push({ id: slugify(criterionTitle, criteria.length), title: criterionTitle, description: descCol >= 0 ? row[descCol] ?? '' : '', maxPoints: points });
  }
  if (!criteria.length) throw new Error('Aucun critère valide trouvé. Vérifiez les colonnes « Critère » et « Points max ».');
  return { rubric: { title, criteria }, warnings: [] };
}
function rubricFromText(text: string, title: string): ImportedRubric {
  const criteria: RubricCriterion[] = [];
  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const match = line.match(/^(.+?)\s*(?:[:;|—–-]|\()\s*(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\s*\)?\s*$/i);
    if (!match) continue;
    const criterionTitle = match[1].trim().replace(/^[-•*\d.)\s]+/, '');
    const points = Number(match[2].replace(',', '.'));
    if (criterionTitle && Number.isFinite(points)) criteria.push({ id: slugify(criterionTitle, criteria.length), title: criterionTitle, description: '', maxPoints: points });
  }
  if (!criteria.length) throw new Error('Aucun critère détecté dans ce fichier texte. Pour un barème PDF, utilisez le modèle de vision local.');
  return { rubric: { title, criteria }, warnings: ['Import du texte : vérifiez les critères et les points avant utilisation.'] };
}
/** Imports structured formats locally. PDFs are rendered by prepareLocalFiles and sent to Ollama vision. */
export async function importRubricFile(file: File): Promise<ImportedRubric> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Le fichier de barème dépasse la limite de 15 Mo.');
  const name = file.name.replace(/\.[^.]+$/, '').trim() || 'Barème importé';
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'json') return rubricFromJson(JSON.parse(await file.text()) as unknown, file.name);
  if (extension === 'xlsx') {
    const rows = await readSheet(file);
    return rubricFromRows(rows.map((row) => row.map((cell) => cell == null ? '' : String(cell))), name);
  }
  if (extension === 'csv') return rubricFromRows(parseDelimitedRows(await file.text()), name);
  if (extension === 'txt' || extension === 'md') return rubricFromText(await file.text(), name);
  if (extension === 'pdf') throw new Error('Les PDF doivent être lus par le modèle de vision local. Sélectionnez le PDF dans « Importer un barème existant ».');
  throw new Error('Format non pris en charge. Utilisez PDF, XLSX, CSV, TXT, Markdown ou JSON.');
}

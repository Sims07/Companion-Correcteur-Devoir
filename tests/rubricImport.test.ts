import { describe, expect, it, vi } from 'vitest';

const { getDocumentMock, mammothMock, readXlsxFileMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  mammothMock: vi.fn(),
  readXlsxFileMock: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: (...args: unknown[]) => getDocumentMock(...args) }));
vi.mock('mammoth', () => ({ extractRawText: (...args: unknown[]) => mammothMock(...args) }));
vi.mock('read-excel-file/browser', () => ({ default: (...args: unknown[]) => readXlsxFileMock(...args) }));

import { importRubricFile } from '../src/adapters/files/rubricImport.ts';

describe('importRubricFile', () => {
  it('imports a JSON rubric without sending it anywhere', async () => {
    const file = new File([JSON.stringify({ title: 'Biologie cellulaire', criteria: [{ title: 'Mitose', maxPoints: 4, description: 'Étapes exactes' }] })], 'bareme.json', { type: 'application/json' });
    const result = await importRubricFile(file);
    expect(result.rubric).toEqual({ title: 'Biologie cellulaire', criteria: [{ id: 'mitose', title: 'Mitose', description: 'Étapes exactes', maxPoints: 4 }] });
    expect(result.warnings).toEqual([]);
  });

  it('imports a CSV table with criterion, maximum points and description columns', async () => {
    const file = new File(['Critère,Points max,Description\nConnaissances,8,Notions exactes\nRaisonnement,12,Argumentation'], 'bareme.csv', { type: 'text/csv' });
    const result = await importRubricFile(file);
    expect(result.rubric.criteria).toEqual([
      { id: 'connaissances', title: 'Connaissances', description: 'Notions exactes', maxPoints: 8 },
      { id: 'raisonnement', title: 'Raisonnement', description: 'Argumentation', maxPoints: 12 },
    ]);
  });

  it('extracts point-valued criteria from a text document and warns the teacher to review them', async () => {
    const file = new File(['Connaissances scientifiques : 8 points\nRaisonnement (12 pts)'], 'bareme.txt', { type: 'text/plain' });
    const result = await importRubricFile(file);
    expect(result.rubric.criteria.map((criterion) => [criterion.title, criterion.maxPoints])).toEqual([['Connaissances scientifiques', 8], ['Raisonnement', 12]]);
    expect(result.warnings.join(' ')).toContain('vérifier');
  });

  it('uses local DOCX text extraction', async () => {
    mammothMock.mockResolvedValue({ value: 'Connaissances : 8 points' });
    const result = await importRubricFile(new File(['docx'], 'bareme.docx'));
    expect(mammothMock).toHaveBeenCalledOnce();
    expect(result.rubric.criteria[0].maxPoints).toBe(8);
  });

  it('uses the first worksheet of an Excel workbook', async () => {
    readXlsxFileMock.mockResolvedValue([['Critère', 'Points max'], ['Connaissances', 8]]);
    const result = await importRubricFile(new File(['xlsx'], 'bareme.xlsx'));
    expect(readXlsxFileMock).toHaveBeenCalledOnce();
    expect(result.rubric.criteria[0].title).toBe('Connaissances');
  });

  it('preserves separate PDF text lines so multiple criteria can be extracted', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn();
    const getTextContent = vi.fn().mockResolvedValue({ items: [
      { str: 'Connaissances : 8 points', transform: [1, 0, 0, 1, 0, 700] },
      { str: 'Raisonnement : 12 points', transform: [1, 0, 0, 1, 0, 680] },
    ] });
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockResolvedValue({ getTextContent, cleanup }) }),
      destroy,
    });
    const result = await importRubricFile(new File(['pdf'], 'bareme.pdf', { type: 'application/pdf' }));
    expect(result.rubric.criteria.map((criterion) => [criterion.title, criterion.maxPoints])).toEqual([
      ['Connaissances', 8],
      ['Raisonnement', 12],
    ]);
    expect(destroy).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rejects unsupported formats with a helpful message', async () => {
    await expect(importRubricFile(new File(['data'], 'bareme.odt'))).rejects.toThrow('Format non pris en charge');
  });

  it('rejects JSON criteria with missing or invalid point values', async () => {
    const file = new File([JSON.stringify({ criteria: [{ title: 'Critère sans points' }] })], 'bareme.json');
    await expect(importRubricFile(file)).rejects.toThrow('maximum de points valide');
  });
});

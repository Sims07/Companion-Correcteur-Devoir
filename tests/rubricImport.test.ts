import { describe, expect, it, vi } from 'vitest';
const { readXlsxFileMock } = vi.hoisted(() => ({ readXlsxFileMock: vi.fn() }));
vi.mock('read-excel-file/browser', () => ({ readSheet: (...args: unknown[]) => readXlsxFileMock(...args) }));
import { importRubricFile } from '../src/adapters/files/rubricImport.ts';
describe('importRubricFile', () => {
  it('imports a JSON rubric locally', async () => {
    const file = new File([JSON.stringify({ title: 'Biologie cellulaire', criteria: [{ title: 'Mitose', maxPoints: 4, description: 'Étapes exactes' }] })], 'bareme.json', { type: 'application/json' });
    const result = await importRubricFile(file);
    expect(result.rubric).toEqual({ title: 'Biologie cellulaire', criteria: [{ id: 'mitose', title: 'Mitose', description: 'Étapes exactes', maxPoints: 4 }] }); expect(result.warnings).toEqual([]);
  });
  it('imports a CSV table with criterion, maximum points and description columns', async () => {
    const file = new File(['Critère,Points max,Description\nConnaissances,8,Notions exactes\nRaisonnement,12,Argumentation'], 'bareme.csv', { type: 'text/csv' });
    const result = await importRubricFile(file);
    expect(result.rubric.criteria).toEqual([{ id: 'connaissances', title: 'Connaissances', description: 'Notions exactes', maxPoints: 8 }, { id: 'raisonnement', title: 'Raisonnement', description: 'Argumentation', maxPoints: 12 }]);
  });
  it('imports criteria from plain text without an extraction dependency', async () => {
    const file = new File(['Connaissances scientifiques : 8 points\nRaisonnement (12 pts)'], 'bareme.txt', { type: 'text/plain' });
    const result = await importRubricFile(file);
    expect(result.rubric.criteria.map((criterion) => [criterion.title, criterion.maxPoints])).toEqual([['Connaissances scientifiques', 8], ['Raisonnement', 12]]);
    expect(result.warnings.join(' ')).toContain('vérifiez');
  });
  it('uses the first worksheet of an Excel workbook', async () => {
    readXlsxFileMock.mockResolvedValue([['Critère', 'Points max'], ['Connaissances', 8]]);
    const result = await importRubricFile(new File(['xlsx'], 'bareme.xlsx'));
    expect(readXlsxFileMock).toHaveBeenCalledOnce(); expect(result.rubric.criteria[0].title).toBe('Connaissances');
  });
  it('does not attempt local PDF text extraction', async () => {
    await expect(importRubricFile(new File(['pdf'], 'bareme.pdf', { type: 'application/pdf' }))).rejects.toThrow('modèle de vision local');
  });
  it('rejects unsupported formats with a helpful message', async () => {
    await expect(importRubricFile(new File(['data'], 'bareme.docx'))).rejects.toThrow('Format non pris en charge');
  });
  it('rejects JSON criteria with missing or invalid point values', async () => {
    const file = new File([JSON.stringify({ criteria: [{ title: 'Critère sans points' }] })], 'bareme.json');
    await expect(importRubricFile(file)).rejects.toThrow('maximum de points valide');
  });
});

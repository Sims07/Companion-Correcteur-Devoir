import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');

describe('copies archivées dans le devoir actif', () => {
  it('persists the stable devoir ID with every finalized correction', () => {
    expect(app).toContain('assignmentId: activeAssignmentId,');
  });

  it('derives the archive list from the selected assignment and refreshes it when the selection changes', () => {
    expect(app).toContain('getArchivedCorrectionsForAssignment(assignmentProfiles, archivedCorrections, activeAssignmentId)');
    expect(app).toContain('[assignmentProfiles, archivedCorrections, activeAssignmentId]');
    expect(app).toContain('archivedCorrectionsForActiveAssignment.map((item) => {');
    expect(app).toContain('{archivedCorrectionsForActiveAssignment.length} COPIE(S)');
    expect(app).not.toContain('{archivedCorrections.map((item) => {');
  });

  it('keeps the all-assignments archive collection available to the assignment library', () => {
    expect(app).toContain('archivedCorrections={archivedCorrections}');
  });
});

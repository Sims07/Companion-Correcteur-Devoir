import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');
const overview = readFileSync('src/ui/CorrectionOverview.tsx', 'utf8');

describe('copies archivées dans le devoir actif', () => {
  it('persists the stable devoir ID with every finalized correction', () => {
    expect(app).toContain('assignmentId: activeAssignmentId,');
  });

  it('derives the archive list from the selected assignment and refreshes it when the selection changes', () => {
    expect(app).toContain('getArchivedCorrectionsForAssignment(assignmentProfiles, archivedCorrections, activeAssignmentId)');
    expect(app).toContain('[assignmentProfiles, archivedCorrections, activeAssignmentId]');
    expect(app).toContain('corrections={archivedCorrectionsForActiveAssignment}');
    expect(overview).toContain('corrections.filter((correction) => Boolean(correction.snapshot))');
    expect(app).not.toContain('{archivedCorrections.map((item) => {');
  });

  it('reopens a saved copy using its stable assignment ID before its editable title', () => {
    expect(app).toContain('correction.assignmentId ? assignmentProfiles.find((profile) => profile.id === correction.assignmentId)');
  });

  it('keeps the all-assignments archive collection available to the assignment library', () => {
    expect(app).toContain('archivedCorrections={archivedCorrections}');
  });
});

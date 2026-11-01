import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');
const styles = readFileSync('src/ui/correctionFlow.css', 'utf8');

describe('navigation entre la bibliothèque de devoirs et l’espace de correction', () => {
  it('ouvre la bibliothèque de devoirs au démarrage', () => {
    expect(app).toContain('const [showAssignmentsHome, setShowAssignmentsHome] = useState(true)');
    expect(app).toContain('interfaceMode === \'teacher\' && showAssignmentsHome && <AssignmentsHome');
  });

  it('présente le devoir actif sans proposer de changer de devoir dans la sidebar', () => {
    expect(app).toContain('aria-label="Devoir actif"');
    expect(app).toContain('DEVOIR SÉLECTIONNÉ');
    expect(app).not.toContain('showAssignmentPicker');
    expect(app).not.toContain('CHANGER DE DEVOIR');
    expect(app).not.toContain('sidebar-all-assignments');
  });

  it('permet de revenir à la bibliothèque depuis un espace de correction', () => {
    expect(app).toContain('className="sidebar-back-to-assignments"');
    expect(app).toContain('setShowAssignmentsHome(true)');
    expect(app).toContain('Mes devoirs');
  });

  it('aère visuellement le retour, le devoir actif et les étapes', () => {
    expect(styles).toContain('.sidebar-back-to-assignments');
    expect(styles).toContain('margin: 0 0 18px');
    expect(styles).toContain('.teacher-step-nav {\n  gap: 11px;');
  });
});

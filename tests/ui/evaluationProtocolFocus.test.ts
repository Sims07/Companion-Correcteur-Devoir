import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Scientific and biology protocol navigation', () => {
  const diagram = readFileSync('src/ui/components/ScientificDiagramProtocolPanel.tsx', 'utf8');
  const biology = readFileSync('src/ui/components/PilotEvaluationPanel.tsx', 'utf8');
  const app = readFileSync('src/ui/App.tsx', 'utf8');

  it('preserves every diagram battery, makes its run controls precede previews and identifies the current run', () => {
    for (const id of ["'reference'", "'arrows'", "'semantic'", "'graph'"]) expect(diagram).toContain(id);
    expect(diagram).toContain('role="tablist" aria-label="Protocoles automatiques des schémas scientifiques"');
    expect(diagram).not.toContain('En cours · {(');
    expect(diagram).not.toContain('className="diagram-lab-live"');
    expect(app).toContain('aria-label="Dernière expérience lancée"');
    expect(app).toContain('Arrêter après l’appel en cours');
    expect(diagram).toContain('className="diagram-lab-protocol-summary"');
    const reference = diagram.indexOf('aria-label="Schémas de référence intégrés"');
    const launch = diagram.indexOf('id="diagram-fixture-repeat-count"', reference);
    const preview = diagram.indexOf('className="diagram-fixture-grid"', reference);
    expect(launch).toBeGreaterThan(reference);
    expect(preview).toBeGreaterThan(launch);
    const semantic = diagram.indexOf('aria-label="Sensibilité sémantique"');
    const semanticLaunch = diagram.indexOf('id="diagram-sensitivity-prompt-mode"', semantic);
    const semanticPreview = diagram.indexOf('className="diagram-fixture-grid diagram-sensitivity-grid"', semantic);
    expect(semanticLaunch).toBeGreaterThan(semantic);
    expect(semanticPreview).toBeGreaterThan(semanticLaunch);
    expect(diagram).toContain('Protocole détaillé');
    expect(diagram).not.toContain('Protocole détaillé et confidentialité');
    expect(diagram).not.toContain('blindGraphUsesRemote');
    expect(diagram).not.toContain('Profil distant : images envoyées');
    expect(diagram).toContain('Préparation des six schémas…');
  });

  it('preserves the biology tests and reveals launch before reference details', () => {
    for (const id of ["'contracts'", "'repeatability'", "'copies'"]) expect(biology).toContain(id);
    expect(biology).not.toContain('className="pilot-evaluation-running"');
    expect(app).toContain('role="status" aria-live="polite" aria-label="Dernière expérience lancée"');
    expect(biology).toContain('aria-label="Objectif du protocole de biologie"');
    const contract = biology.indexOf('aria-label="Protocole variante B par question"');
    const launch = biology.indexOf('onClick={onRunContracts}', contract);
    const reference = biology.indexOf('summary>Voir les trois réponses et le barème de référence', contract);
    expect(launch).toBeGreaterThan(contract);
    expect(reference).toBeGreaterThan(launch);
  });
});

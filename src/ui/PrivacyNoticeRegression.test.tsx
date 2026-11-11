import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiModelConfiguration } from '../domain/aiModelProfiles.ts';
import { ObservabilityDashboard } from './ObservabilityDashboard.tsx';
import { ScientificDiagramTeacherPanel } from './components/ScientificDiagramTeacherPanel.tsx';

function diagramPanel(endpoint: string): string {
  const configuration = {
    endpoint, analysisModel: 'vision-model', correctionMethod: 'generative',
  } as AiModelConfiguration;
  return renderToStaticMarkup(
    <ScientificDiagramTeacherPanel
      profiles={[]}
      currentConfiguration={configuration}
      onPrepareImages={async () => []}
      onRotateImage={async (image) => image}
      onRun={async () => { throw new Error('No run in server rendering'); }}
      onOpenSettings={vi.fn()}
    />,
  );
}

const source = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('aides de confidentialité non répétitives', () => {
  it('supprime les encarts locaux de la page observabilité sans perdre ses commandes', () => {
    const markup = renderToStaticMarkup(<ObservabilityDashboard records={[]} />);
    expect(markup).toContain('Incidents à examiner');
    expect(markup).toContain('Observabilité');
    expect(markup).not.toContain('observability-local-badge');
    expect(markup).not.toContain('observability-intro');
    expect(markup).not.toContain('Les traces techniques restent sur cet appareil');
  });

  it('ne répète pas les assurances cloud pour le modèle local', () => {
    const markup = diagramPanel('http://localhost:11434');
    expect(markup).not.toContain('diagram-teacher-local');
    expect(markup).not.toContain('Aucune API cloud');
    expect(markup).not.toContain('J’autorise l’envoi de ces images');
  });

  it('conserve la confirmation explicite sur un serveur distant', () => {
    const markup = diagramPanel('https://remote.example.org/v1/chat/completions');
    expect(markup).toContain('Serveur non local');
    expect(markup).toContain('J’autorise l’envoi de ces images');
    expect(markup).toContain('type="checkbox"');
  });

  it('supprime les slogans du bandeau et des imports, sans toucher au consentement distant', () => {
    const app = source('./App.tsx');
    expect(app).not.toContain('Mode local prioritaire');
    expect(app).not.toContain('evaluation-provider-indicator');
    expect(app).not.toContain('evaluation-page-header');
    expect(app).not.toContain('Paramètres de l’IA locale');
    expect(app).not.toContain('Les derniers réglages sont restaurés automatiquement.');
    expect(app).not.toContain('transmis uniquement au serveur configuré');
    expect(app).toContain('<option value="ollama">Ollama local</option>');
    expect(app).toContain("selectedEvaluationProfiles.some((profile) => !isLocalPilotProfile(profile))");
    expect(app).toContain('Une configuration distante est sélectionnée : les contenus de ce test');
    expect(app).not.toContain('Aucun service cloud n’est utilisé');
    expect(app).not.toContain('Les pages sont préparées dans le navigateur. Elles sont transmises uniquement');
    expect(app).not.toContain('Données locales</span>');
    expect(app).toContain('J’autorise l’envoi des images de ce devoir');
    expect(app).toContain('Vérifiez toujours le résultat avant utilisation.');
  });

  it('retire les slogans locaux des sous-parcours sans masquer les envois distants', () => {
    const assignments = source('./AssignmentsHome.tsx');
    const profiles = source('./components/EvaluationProfilesDialog.tsx');
    const pilot = source('./components/PilotEvaluationPanel.tsx');
    const rubric = source('./components/RubricImportPanel.tsx');
    const history = source('./components/ScientificDiagramLabHistory.tsx');
    const scientific = source('./components/ScientificDiagramProtocolPanel.tsx');
    const diagram = source('./components/ScientificDiagramTeacherPanel.tsx');
    const inspector = source('./NetworkInspector.tsx');
    const together = [assignments, profiles, pilot, rubric, history, scientific, diagram, inspector].join('\n');

    for (const phrase of [
      'Les copies restent sur votre Ollama local.',
      'fichiers transmis uniquement aux serveurs locaux',
      'enregistrés localement sur cet appareil',
      'sélection est enregistrée sur cet appareil',
      'Fichier JSON versionné · traitement local',
      'conservées localement',
      'Préparation locale des pages',
      'Préparation des images sur cet appareil',
    ]) expect(together).not.toContain(phrase);

    expect(assignments).toContain('Retour au devoir actif');
    expect(pilot).toContain('Une configuration distante recevra les photos et les transcriptions');
    expect(scientific).toContain('Les images seront envoyées à son serveur.');
    expect(diagram).toContain('J’autorise l’envoi de ces images');
  });

  it('conserve les avertissements distants dans les campagnes de tests', () => {
    const protocol = source('./components/ScientificDiagramProtocolPanel.tsx');
    expect(protocol).toContain('Les images seront envoyées à son serveur.');
    expect(protocol).not.toContain('Aucun basculement implicite vers le cloud');
    expect(source('./components/ScientificDiagramRadar.tsx')).not.toContain('Toute modification est enregistrée localement');
    expect(source('./components/PilotEvaluationPanel.tsx')).not.toContain('Aucun accès au cloud');
  });
});

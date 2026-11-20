import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';
import { ObservabilityDashboard } from '../../src/shell/ui/ObservabilityDashboard.tsx';
import { ScientificDiagramTeacherPanel } from '../../src/correction/ui/components/ScientificDiagramTeacherPanel.tsx';

const source = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8');

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

describe('parcours sans bandeaux de consentement ou de confidentialité répétitifs', () => {
  it('conserve les commandes de l’observabilité sans encart de confidentialité', () => {
    const markup = renderToStaticMarkup(<ObservabilityDashboard records={[]} />);
    expect(markup).toContain('Incidents à examiner');
    expect(markup).toContain('Observabilité');
    expect(markup).not.toContain('observability-local-badge');
    expect(markup).not.toContain('observability-intro');
    expect(markup).not.toContain('Les traces techniques restent sur cet appareil');
  });

  it.each(['http://localhost:11434', 'https://ai.example/v1/chat/completions'])(
    'affiche directement les commandes de correction avec le serveur %s',
    (endpoint) => {
      const markup = diagramPanel(endpoint);
      expect(markup).toContain('Corriger directement l’image');
      expect(markup).toContain('Configuration IA');
      expect(markup).not.toContain('Serveur non local');
      expect(markup).not.toContain('J’autorise');
      expect(markup).not.toContain('diagram-teacher-remote');
    },
  );

  it('ne montre aucune case de consentement dans le parcours Copies', () => {
    const app = source('../../src/shell/ui/App.tsx');
    expect(app).toContain('<DiagramRubricQuickAccess');
    expect(app).not.toContain('Voir le barème graphique');
    const quickAccess = source('../../src/correction/ui/components/DiagramRubricQuickAccess.tsx');
    expect(quickAccess).toContain('Consultation en lecture seule');
    expect(quickAccess).not.toContain('J’autorise');
    expect(quickAccess).not.toContain('Serveur non local');
    expect(app).not.toContain('diagram-assignment-consent');
    expect(app).not.toContain('diagramConsentEndpoint');
    expect(app).not.toContain('J’autorise l’envoi');
    expect(app).not.toContain('Serveur non local');
    expect(app).not.toContain('evaluation-remote-endpoint-notice');
    expect(app).toContain('<option value="ollama">Ollama local</option>');
    expect(app).toContain('Vérifiez toujours le résultat avant utilisation.');
  });

  it('ne réintroduit pas de messages serveur distant dans les outils et les campagnes de test', () => {
    const files = [
      '../../src/correction/ui/AssignmentsHome.tsx',
      '../../src/evaluation/ui/components/EvaluationProfilesDialog.tsx',
      '../../src/evaluation/ui/components/PilotEvaluationPanel.tsx',
      '../../src/correction/ui/components/RubricImportPanel.tsx',
      '../../src/evaluation/ui/components/ScientificDiagramLabHistory.tsx',
      '../../src/evaluation/ui/components/ScientificDiagramProtocolPanel.tsx',
      '../../src/correction/ui/components/ScientificDiagramTeacherPanel.tsx',
      '../../src/shell/ui/NetworkInspector.tsx',
    ];
    for (const file of files) {
      const content = source(file);
      for (const phrase of [
        'Serveur non local',
        'J’autorise l’envoi',
        'Une configuration distante recevra',
        'Les images seront envoyées à son serveur',
        'Profil distant : images envoyées',
        'Les copies restent sur votre Ollama local.',
        'fichiers transmis uniquement aux serveurs locaux',
        'enregistrés localement sur cet appareil',
        'sélection est enregistrée sur cet appareil',
        'Fichier JSON versionné · traitement local',
        'conservées localement',
        'Préparation locale des pages',
        'Préparation des images sur cet appareil',
      ]) expect(content, `${file} : ${phrase}`).not.toContain(phrase);
    }
    expect(source('../../src/evaluation/ui/components/PilotEvaluationPanel.tsx')).toContain('Lancer les 3 lectures (Vision seule)');
    expect(source('../../src/evaluation/ui/components/ScientificDiagramProtocolPanel.tsx')).toContain('Tester les 3 schémas en un clic');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('teacher and AI diagnostic interface modes', () => {
  const app = () => source('../src/ui/App.tsx');

  it('keeps a local archive and next-copy path after finalization', () => {
    const text = app();
    expect(text).toContain("useState<'rubric' | 'copy' | 'progress' | 'review' | 'archive'>('rubric')");
    expect(text).toContain('Corrections enregistrées');
    expect(text).toContain('Ajouter une autre copie');
    expect(text).toContain('Consulter la correction');
    expect(text).toContain('archiveService.saveCorrection(correction)');
    expect(text).toContain('images: structuredClone(images)');
    expect(text).toContain('snapshot.review');
    expect(text).toContain('stocké dans ce navigateur');
  });

  it('defaults to the teacher correction view', () => {
    expect(app()).toContain("useState<'teacher' | 'diagnostic'>('teacher')");
    expect(app()).toContain("interfaceMode === 'teacher' ? 'view-switch-button active' : 'view-switch-button'");
  });

  it('exposes an accessible switch whose buttons reflect the selected mode', () => {
    const text = app();
    expect(text).toContain('role="group" aria-label="Mode d’interface"');
    expect(text).toContain("aria-pressed={interfaceMode === 'teacher'}");
    expect(text).toContain("aria-pressed={interfaceMode === 'diagnostic'}");
    expect(text).toContain("onClick={() => setInterfaceMode('teacher')}");
    expect(text).toContain("onClick={() => setInterfaceMode('diagnostic')}");
  });

  it('removes duplicate branding and makes missing local AI setup obvious in the sidebar', () => {
    const text = app();
    expect(text).not.toContain('<strong>Correction</strong><small>Espace enseignant</small>');
    expect(text).toContain('IA locale à configurer');
    expect(text).toContain('Configurer maintenant');
    expect(text).toContain('setShowAiSettings(true)');
    expect(text).toContain('is-processing');
    expect(text).toContain('Lecture des copies en cours');
    expect(text).toContain('Analyse et notation en cours');
  });

  it('keeps Ollama configuration hidden until explicitly opened from teacher settings', () => {
    const text = app();
    expect(text).toContain(`{interfaceMode === 'diagnostic' ? <article className="panel ollama-panel">`);
    expect(text).toContain("interfaceMode === 'teacher' && showAiSettings && <section className={`panel ollama-panel teacher-model-panel ai-settings-view");
    expect(text).toContain('Paramètres de l’IA locale');
    expect(text).toContain('Tester la connexion et détecter les modèles');
    expect(text).toContain('aria-expanded={showAiSettings}');
    expect(text).toContain("onClick={() => setShowAiSettings((current) => !current)}");
    expect(text).toContain('Ces options ne sont appliquées qu’en mode Diagnostic IA. Le mode Correction reste sur un seul modèle.');
  });

  it('only displays raw streaming output in diagnostic mode', () => {
    expect(app()).toContain(`{interfaceMode === 'diagnostic' && streamedOutput && <div className="streaming-preview"`);
  });

  it('offers integrated-question and separate-subject modes, with separate subject upload only when needed', () => {
    const text = app();
    expect(text).toContain("useState<'integrated' | 'separate'>('integrated')");
    expect(text).toContain('Où se trouvent les questions ?');
    expect(text).toContain('Questions intégrées à la copie');
    expect(text).toContain('Sujet fourni séparément');
    expect(text).toContain("correctionMode === 'separate' && <section className={`panel subject-panel ${subjectReady ? 'setup-complete' : 'setup-needed'}`}");
    expect(text).toContain('id="subject-files"');
    expect(text).toContain('Sélectionnez uniquement les pages d’un même étudiant');
    expect(text).toContain('subjectImages');
    expect(text).toContain(`{interfaceMode === 'diagnostic' && <span className="number">02</span>}`);
    expect(text).toContain(`{interfaceMode === 'diagnostic' && <span className="number">03</span>}`);
  });

  it('provides a teacher-specific three-step navigation and shows only the active task', () => {
    const text = app();
    expect(text).toContain("useState<'rubric' | 'copy' | 'progress' | 'review'>('rubric')");
    expect(text).toContain('aria-label="Navigation de la correction"');
    expect(text).toContain('aria-label="Étapes du devoir"');
    expect(text).toContain('Préparer le barème');
    expect(text).toContain('Ajouter une copie');
    expect(text).toContain('Réviser la note');
    expect(text).toContain('Suivi du traitement');
    expect(text).toContain("setTeacherStep('progress')");
    expect(text).toContain("(interfaceMode === 'diagnostic' || teacherStep === 'rubric') && <>");
    expect(text).toContain("(interfaceMode === 'diagnostic' || teacherStep === 'copy') && <>");
    expect(text).toContain("setTeacherStep('review')");
    expect(text).toContain("const assignmentTitleKey = 'companion-correcteur:assignment-title:v1'");
    expect(text).toContain('setItem(assignmentTitleKey, assignmentTitle)');
    expect(text).not.toContain('Un devoir, un espace de travail');
  });

  it('keeps the diagnostic welcome isolated from the teacher workspace', () => {
    const text = app();
    expect(text).toContain("{interfaceMode === 'diagnostic' && <section className=\"welcome\">");
    expect(text).toContain('ESPACE DE DIAGNOSTIC · IA LOCALE');
    expect(text).toContain('Accédez aux réglages Ollama, aux modèles et aux sorties de diagnostic');
    expect(text).not.toContain('Un devoir, un espace de travail');
  });

  it('presents saved teacher decisions in plain language instead of technical local-memory terminology', () => {
    const text = source('../src/ui/LocalMemoryCompanion.tsx');
    expect(text).toContain('Règles de correction');
    expect(text).toContain('DÉCISIONS DE L’ENSEIGNANT');
    expect(text).toContain('Ici, vous indiquez à l’assistant comment appliquer votre correction.');
    expect(text).toContain('Votre décision');
    expect(text).toContain('Enregistrer la décision');
    expect(text).not.toContain('> Mémoire locale ');
  });

  it('explains the distinction between feedback for a correction and reusable rubric rules', () => {
    const text = source('../src/ui/LocalMemoryCompanion.tsx');
    expect(text).toContain('Correction active');
    expect(text).toContain('Barème utilisé');
    expect(text).toContain('Réutiliser cette décision avec le barème');
    expect(text).toContain('Sinon, elle reste limitée à la correction active.');
    expect(text).toContain('RÈGLE DU BARÈME');
    expect(text).toContain('RETOUR POUR CE DEVOIR');
  });

  it('keeps the extracted transcription available for teacher verification after image reading', () => {
    const text = app();
    expect(text).toContain('Vérifier le texte lu par l’IA');
    expect(text).toContain('Relisez la transcription pour repérer les erreurs de lecture');
    expect(text).toContain('{transcription && <section className="transcription-text-block">');
    expect(text).toContain('{correctionMode === \'separate\' && subjectTranscription && <section className="transcription-text-block">');
    expect(text).toContain('Texte de la copie étudiante');
    expect(text).toContain('Texte du sujet de référence');
    expect(text).toContain('className="transcription-review"');
  });

  it('records separate reading and analysis durations and keeps a local comparison history', () => {
    const text = app();
    expect(text).toContain("const timingHistoryKey = 'companion-correcteur:timing-history:v1'");
    expect(text).toContain('readingSeconds:');
    expect(text).toContain('analysisSeconds:');
    expect(text).toContain('totalSeconds:');
    expect(text).toContain('setItem(timingHistoryKey, JSON.stringify(next))');
    expect(text).toContain('Temps des dernières corrections');
    expect(text).toContain('Modèles (lecture / analyse)');
    expect(text).toContain('Réutilisée / non mesurée');
    expect(text).toContain('Effacer l’historique');
    expect(text).toContain('pageCount: images.length');
  });
});

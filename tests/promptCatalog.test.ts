import { MODEL_READINESS_PROBE_PROMPT } from '../src/adapters/ai/prompts/modelProbePrompt.ts';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTranscriptionPrompt, buildStudentIdentityPrompt, buildTeacherAnnotationPrompt, buildSubjectReferencePrompt, buildStudentIdentityFallbackPrompt, buildTeacherAnnotationRepairPrompt, buildRubricPageTranscriptionPrompt } from '../src/adapters/ai/prompts/visionPrompts.ts';
import { buildFullGradingPrompt } from '../src/adapters/ai/prompts/fullGradingPrompt.ts';
import { buildArbitrationPrompt, buildArbitrationRepairPrompt, buildIncrementalGradingRepairPrompt, buildGradingRepairPrompt, buildCriterionDecisionRepairPrompt } from '../src/adapters/ai/prompts/repairPrompts.ts';
import { classificationPrompt, buildScientificDiagramPrompt, buildConciseScientificDiagramPrompt, buildScientificDiagramRepairPrompt } from '../src/adapters/ai/prompts/scientificDiagramPrompts.ts';
import type { GradingRequest } from '../src/ports/aiProvider.ts';
import type { ScientificDiagramAnalysisRequest } from '../src/ports/scientificDiagramAnalysis.ts';

describe('catalogue des prompts', () => {
  it('préserve les consignes de lecture, identification et annotations', () => {
    expect(buildTranscriptionPrompt('glm-ocr:latest')).toContain('Do not flatten a table');
    expect(buildTranscriptionPrompt('qwen:4b')).toContain('Ne devine, ne complète et n’invente aucun mot');
    expect(buildStudentIdentityPrompt()).toContain('première page');
    expect(buildStudentIdentityFallbackPrompt()).toContain('firstName, lastName, studentNumber');
    expect(buildTeacherAnnotationPrompt('Copie originale')).toContain('<transcription_initiale>\nCopie originale\n</transcription_initiale>');
    expect(buildTeacherAnnotationRepairPrompt('Copie originale', 'Erreur')).toContain('Erreur');
    expect(buildSubjectReferencePrompt('Sujet Q1')).toContain('ÉTIQUETTE DE PAGE (métadonnée) : "Sujet Q1"');
    expect(buildRubricPageTranscriptionPrompt(2, 3, 'barème · page 2')).toContain('Page 2 sur 3');
  });

  it('conserve la correction exhaustive et les réparations sans modifier les contrats JSON', () => {
    const request = {
      question: 'Décrire la respiration.',
      rubric: JSON.stringify({ criteria: [{ id: 'ATP', title: 'ATP', description: 'Mitochondrie', maxPoints: 2 }] }),
    } as GradingRequest;
    const prompt = buildFullGradingPrompt(request, '[ page 1 ] Production ATP', 'Énoncez le sujet.');
    expect(prompt).toContain('IDENTIFIANTS DE CRITÈRES AUTORISÉS : ["ATP"]');
    expect(prompt).toContain('<transcription_etudiant>\n[ page 1 ] Production ATP\n</transcription_etudiant>');
    expect(prompt).toContain('<sujet_reference>\nÉnoncez le sujet.\n</sujet_reference>');
    expect(prompt).toContain('La correction produite est une proposition de travail');
    expect(buildArbitrationPrompt([{ id: 'ATP' }], 'Production ATP', { notes: 1 }, { notes: 2 })).toContain('AVIS 2 (JSON)');
    expect(buildArbitrationRepairPrompt('Arbitrage', 'invalide', 'JSON')).toContain('invalide');
    expect(buildIncrementalGradingRepairPrompt('Critère', 'ancien', 'invalide')).toContain('ancien');
    expect(buildGradingRepairPrompt('Correction', 'ancien', 'JSON')).toContain('ancien');
    expect(buildCriterionDecisionRepairPrompt('Critère', 'invalide')).toContain('invalide');
    expect(MODEL_READINESS_PROBE_PROMPT).toBe('Réponds uniquement par OK.');
  });

  it('préserve classification et évaluation des schémas et leurs reprises courtes', () => {
    const request = {
      question: 'Identifier les éléments.',
      images: [{ base64: 'AQ==', mimeType: 'image/png', fileName: 'page.png' }],
      rubric: { title: 'Schéma', criteria: [{ id: 'c1', title: 'Légendes', description: 'Exactitude', maxPoints: 3 }] },
    } as unknown as ScientificDiagramAnalysisRequest;
    expect(classificationPrompt(2)).toContain('Classer la page 2');
    expect(classificationPrompt(2, 'cassé', 'JSON')).toContain('Réponse précédente à réparer');
    expect(buildScientificDiagramPrompt(request)).toContain('CRITÈRES VISUELS');
    expect(buildScientificDiagramPrompt(request)).toContain('Ignore les marques de correction');
    expect(buildScientificDiagramPrompt(request)).toContain('qualité graphique scientifique');
    expect(buildScientificDiagramPrompt(request)).toContain('Ne juge jamais la beauté subjective');
    expect(buildConciseScientificDiagramPrompt(request)).toContain('qualité graphique scientifique');
    expect(buildConciseScientificDiagramPrompt(request)).toContain('réponse beaucoup plus courte');
    expect(buildScientificDiagramRepairPrompt(request, 'JSON', 'ancien')).toContain('ancien');
  });

  it('empêche le retour des longues consignes dans les adaptateurs de transport', () => {
    const provider = readFileSync(new URL('../src/adapters/ai/ollamaProvider.ts', import.meta.url), 'utf8');
    const diagrams = readFileSync(new URL('../src/adapters/ai/openAiScientificDiagramAnalyzer.ts', import.meta.url), 'utf8');
    expect(provider).not.toContain('RÔLE ET LIMITE : tu es un assistant de correction');
    expect(provider).not.toContain('RÔLE : identifie l’étudiant indiqué');
    expect(provider).not.toContain('RÔLE : tu es un lecteur fidèle de barèmes');
    expect(diagrams).not.toContain('La classification préalable suggère un schéma');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RubricAuditPanel, RubricCriterionEnrichments, RubricCriterionEnrichmentCount } from '../../src/correction/ui/components/RubricAuditPanel.tsx';
import type { Rubric } from '../../src/correction/domain/rubric.ts';
import { parseRubricAudit } from '../../src/correction/domain/rubricAudit.ts';
import { createClarifiedRubricVersion } from '../../src/correction/domain/rubricClarification.ts';

vi.mock('../../src/correction/adapters/ai/rubricAuditOllama.ts', () => ({ auditRubricWithOllama: vi.fn() }));
const rubric: Rubric = { title: 'Mitose', criteria: [{ id: 'title', title: 'Titre principal', description: '', maxPoints: 2 }] };

describe('panneau de clarification enseignant', () => {
  it('affiche un audit optionnel, sans copie ni prévalidation du barème', () => {
    const html = renderToStaticMarkup(<RubricAuditPanel rubric={rubric} assignmentId="test" endpoint="http://localhost:11434" model="qwen-local" onApply={vi.fn()} />);
    expect(html).toContain('Vérifier et enrichir le barème');
    expect(html).toContain('Vérifier avec l’IA locale');
    expect(html).toContain('primary-button rubric-audit-launch');
    expect(html).toContain('avant de corriger les copies');
    expect(html).not.toContain('rubric-audit-live');
    expect(html).toContain('aucune copie d&#x27;étudiant');
    expect(html).toContain('facultative');
  });
  it('explique le budget supérieur quand Thinking est activé, sans l’imposer au mode normal', () => {
    const props = { rubric, assignmentId: 'budget-test', endpoint: 'http://localhost:11434', model: 'gemma4:12b', onApply: vi.fn() };
    const thinking = renderToStaticMarkup(<RubricAuditPanel {...props} thinking />);
    const normal = renderToStaticMarkup(<RubricAuditPanel {...props} thinking={false} />);
    expect(thinking).toMatch(/plafond de génération :.*16[^0-9]*384 tokens/);
    expect(thinking).toMatch(/contexte : 24[^0-9]*576 tokens/);
    expect(normal).toMatch(/plafond de génération :.*3[^0-9]*584 tokens/);
    expect(normal).not.toContain('contexte :');
  });

  it('affiche les ajouts approuvés au lieu de deux blocs JSON, sans confondre une édition ultérieure', () => {
    const audit = parseRubricAudit(JSON.stringify({ issues: [{
      criterionId: 'title', priority: 'high', reason: 'Ambiguïté de titre',
      question: 'Titre global attendu ?', options: ['Oui', 'Non'],
      suggestion: 'Texte suggéré',
    }] }), rubric, 'ollama-local');
    const version = createClarifiedRubricVersion(rubric, audit, [{
      issueId: audit.issues[0].id, decision: 'accepted', choice: 'Oui',
    }], '2026-11-17T14:00:00Z');
    const assignmentId = 'test-clarification-visible';
    const key = 'companion-correcteur:rubric-versions:v1:' + assignmentId;
    // Vitest runs this SSR test without a browser window.
    const entries = new Map([[key, JSON.stringify([version])]]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (name: string) => entries.get(name) ?? null,
        setItem: (name: string, value: string) => { entries.set(name, value); },
        removeItem: (name: string) => { entries.delete(name); },
      },
    });
    try {
      const props = { assignmentId, endpoint: 'http://localhost:11434', model: 'ollama-local', onApply: vi.fn() };
      const applied = renderToStaticMarkup(<RubricAuditPanel rubric={version.clarified} {...props} />);
      expect(applied).toContain('BARÈME MODIFIÉ · VERSION ACTIVE');
      expect(applied).toContain('Avant · texte du barème');
      expect(applied).toContain('Ajout validé par le professeur');
      expect(applied).toContain('Décision du professeur : Oui');
      expect(applied).toContain('Utilisé pour les prochaines corrections');

      const edited = renderToStaticMarkup(<RubricAuditPanel
        rubric={{ ...version.clarified, title: 'Barème ajusté' }} {...props} />);
      expect(edited).toContain('Le barème actuel a évolué depuis la dernière application IA.');
      expect(edited).toContain('Restaurer la première version conservée');
      expect(edited.indexOf('Restaurer la première version conservée'))
        .toBeLessThan(edited.indexOf('rubric-audit-change-list'));
      expect(edited).toContain('L’historique ancien a pu');
      expect(edited).not.toContain('BARÈME MODIFIÉ · VERSION ACTIVE');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('affiche la provenance des ajouts dans le critère et un bilan cumulé après édition manuelle', () => {
    const scienceRubric: Rubric = {
      title: 'Mitose', criteria: [{ id: 'bio', title: 'Biologie', description: 'Repérer les phases', maxPoints: 2 }],
    };
    const report = parseRubricAudit(JSON.stringify({ issues: [{
      kind: 'scientific', criterionId: 'bio', subcriterionId: null, priority: 'high',
      question: 'Quelle référence ?', options: ['Oui', 'Adapter'], reason: 'Référence absente',
      suggestion: 'Les chromatides migrent vers les pôles.',
    }] }), scienceRubric, 'gemma-local');
    const version = createClarifiedRubricVersion(scienceRubric, report, [{
      issueId: report.issues[0].id, choice: 'Les chromatides migrent vers les pôles.', decision: 'accepted',
    }], '2026-11-17T15:00:00Z');
    const assignmentId = 'test-visible-science';
    vi.stubGlobal('window', { localStorage: {
      getItem: (name: string) => name === 'companion-correcteur:rubric-versions:v1:' + assignmentId
        ? JSON.stringify([version]) : null,
    } });
    try {
      const html = renderToStaticMarkup(<RubricCriterionEnrichments
        rubric={version.clarified} assignmentId={assignmentId} criterionId="bio" onChange={vi.fn()} />);
      expect(html).toContain('Référence scientifique IA');
      expect(html).toContain('Les chromatides migrent vers les pôles.');
      expect(html).toContain('gemma-local');
      expect(html).toContain('Application 1');
      expect(html).toContain('Repérer les phases');
      expect(html).toContain('Retirer cet ajout');
      const badge = renderToStaticMarkup(<RubricCriterionEnrichmentCount
        rubric={version.clarified} assignmentId={assignmentId} criterionId="bio" />);
      expect(badge).toContain('1 ajout IA');
      const panel = renderToStaticMarkup(<RubricAuditPanel
        rubric={{ ...version.clarified, title: 'Mitose modifiée' }} assignmentId={assignmentId}
        endpoint="http://localhost:11434" model="gemma-local" onApply={vi.fn()} />);
      expect(panel).toContain('Bilan cumulé');
      expect(panel).toContain('Origine des ajouts toujours actifs');
      expect(panel).toContain('première version conservée');
      const baselineKey = 'companion-correcteur:rubric-baseline:v1:' + assignmentId;
      vi.stubGlobal('window', { localStorage: {
        getItem: (name: string) => name === baselineKey
          ? JSON.stringify({ source: 'initial', rubric: scienceRubric })
          : name === 'companion-correcteur:rubric-versions:v1:' + assignmentId ? JSON.stringify([version]) : null,
      } });
      const original = renderToStaticMarkup(<RubricAuditPanel rubric={version.clarified} assignmentId={assignmentId}
        endpoint="http://localhost:11434" model="gemma-local" onApply={vi.fn()} />);
      expect(original).toContain('Restaurer le barème initial');
      expect(original).toContain('Bilan cumulé : barème initial');
    } finally {
      vi.unstubAllGlobals();
    }
  });

});
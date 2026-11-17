import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RubricAuditPanel } from '../../src/correction/ui/components/RubricAuditPanel.tsx';
import type { Rubric } from '../../src/correction/domain/rubric.ts';
import { parseRubricAudit } from '../../src/correction/domain/rubricAudit.ts';
import { createClarifiedRubricVersion } from '../../src/correction/domain/rubricClarification.ts';

vi.mock('../../src/correction/adapters/ai/rubricAuditOllama.ts', () => ({ auditRubricWithOllama: vi.fn() }));
const rubric: Rubric = { title: 'Mitose', criteria: [{ id: 'title', title: 'Titre principal', description: '', maxPoints: 2 }] };

describe('panneau de clarification enseignant', () => {
  it('affiche un audit optionnel, sans copie ni prévalidation du barème', () => {
    const html = renderToStaticMarkup(<RubricAuditPanel rubric={rubric} assignmentId="test" endpoint="http://localhost:11434" model="qwen-local" onApply={vi.fn()} />);
    expect(html).toContain('Vérifier et clarifier le barème');
    expect(html).toContain('Vérifier avec l’IA locale');
    expect(html).toContain('primary-button rubric-audit-launch');
    expect(html).toContain('avant de corriger les copies');
    expect(html).not.toContain('rubric-audit-live');
    expect(html).toContain('aucune copie d&#x27;étudiant');
    expect(html).toContain('facultative');
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
    window.localStorage.setItem(key, JSON.stringify([version]));
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
      expect(edited).toContain('Le barème actuel a été modifié depuis la dernière clarification.');
      expect(edited).not.toContain('BARÈME MODIFIÉ · VERSION ACTIVE');
    } finally {
      window.localStorage.removeItem(key);
    }
  });

});
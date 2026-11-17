import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RubricAuditPanel } from '../../src/correction/ui/components/RubricAuditPanel.tsx';
import type { Rubric } from '../../src/correction/domain/rubric.ts';

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
});
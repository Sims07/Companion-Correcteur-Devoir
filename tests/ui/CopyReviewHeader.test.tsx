import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CopyReviewHeader } from '../../src/ui/components/CopyReviewHeader.tsx';

describe('CopyReviewHeader', () => {
  it('presents the editable student, position, status, score and validation action', () => {
    const html = renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont"
      onStudentLabelChange={vi.fn()}
      position={3}
      totalCopies={12}
      status="À vérifier"
      score={14.5}
      maximumPoints={20}
      isAnalyzing={false}
      isFinalized={false}
      canValidate
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      onValidate={vi.fn()}
    />);

    expect(html).toContain('Nom lu sur la copie');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('Copie 3 sur 12');
    expect(html).toContain('À vérifier');
    expect(html).toContain('14,5 / 20');
    expect(html).toContain('Valider et passer à la suivante');
    expect(html).toContain('aria-keyshortcuts="Control+Enter Meta+Enter"');
  });

  it('prevents validation while analysis is running or the copy is already finalized', () => {
    const render = (isAnalyzing: boolean, isFinalized: boolean) => renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont"
      onStudentLabelChange={vi.fn()}
      position={1}
      totalCopies={1}
      status={isFinalized ? 'Corrigée' : isAnalyzing ? 'Analyse en cours' : 'À vérifier'}
      score={14.5}
      maximumPoints={20}
      isAnalyzing={isAnalyzing}
      isFinalized={isFinalized}
      canValidate
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      onValidate={vi.fn()}
    />);
    expect(render(true, false)).toContain('disabled=""');
    expect(render(false, true)).toContain('Correction validée');
  });
});

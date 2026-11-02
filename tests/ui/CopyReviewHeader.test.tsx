import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CopyReviewHeader } from '../../src/ui/components/CopyReviewHeader.tsx';

const callbacks = { onStudentLabelChange: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn(), onValidate: vi.fn() };

describe('CopyReviewHeader', () => {
  it('presents the editable student, position, status, score and validation action', () => {
    const html = renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont" {...callbacks} position={3} totalCopies={12}
      status="À vérifier" score={14.5} maximumPoints={20} isAnalyzing={false}
      isFinalized={false} canValidate canPrevious canNext
      previousLabel="Martin · À reprendre" nextLabel="Dupont · En attente"
    />);
    expect(html).toContain('Nom lu sur la copie');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('Copie 3 sur 12');
    expect(html).toContain('À vérifier');
    expect(html).toContain('14,5 / 20');
    expect(html).toContain('Valider et passer à la suivante');
    expect(html).toContain('title="Copie suivante : Dupont · En attente"');
    expect(html).toContain('title="Copie précédente : Martin · À reprendre"');
  });

  it('disables only unavailable navigation directions and prevents validation while analyzing or finalized', () => {
    const render = (isAnalyzing: boolean, isFinalized: boolean) => renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont" {...callbacks} position={1} totalCopies={1}
      status={isFinalized ? 'Corrigée' : isAnalyzing ? 'Analyse en cours' : 'À vérifier'}
      score={14.5} maximumPoints={20} isAnalyzing={isAnalyzing} isFinalized={isFinalized}
      canValidate canPrevious={false} canNext={false}
    />);
    const html = renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont" {...callbacks} position={2} totalCopies={3}
      status="À vérifier" score={14.5} maximumPoints={20} isAnalyzing={false}
      isFinalized={false} canValidate canPrevious canNext
    />);
    expect(html.match(/disabled=""/g)).toBeNull();
    expect(render(true, false)).toContain('disabled=""');
    expect(render(false, true)).toContain('Correction validée');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CopyReviewHeader } from '../../src/ui/components/CopyReviewHeader.tsx';

const callbacks = { onStudentLabelChange: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };

describe('CopyReviewHeader', () => {
  it('presents only student, navigation, status and grade without redundant archive action', () => {
    const html = renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont" {...callbacks} position={3} totalCopies={12}
      status="À vérifier" score={14.5} maximumPoints={20}
      isFinalized={false} canPrevious canNext
      previousLabel="Martin · À reprendre" nextLabel="Dupont · En attente"
    />);
    expect(html).toContain('Nom lu sur la copie');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('Copie 3 sur 12');
    expect(html).toContain('À vérifier');
    expect(html).toContain('14,5 / 20');
    expect(html).not.toContain('Valider et passer à la suivante');
    expect(html).not.toContain('Correction validée');
    expect(html).toContain('title="Copie suivante : Dupont · En attente"');
    expect(html).toContain('title="Copie précédente : Martin · À reprendre"');
  });

  it('blocks unavailable directions, but keeps completed grade readable', () => {
    const render = (isFinalized: boolean) => renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont" {...callbacks} position={1} totalCopies={1}
      status={isFinalized ? 'Corrigée' : 'À vérifier'}
      score={14.5} maximumPoints={20} isFinalized={isFinalized}
      canPrevious={false} canNext={false}
    />);
    const html = renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Marie Dupont" {...callbacks} position={2} totalCopies={3}
      status="À vérifier" score={14.5} maximumPoints={20} isFinalized={false}
      canPrevious canNext
    />);
    expect(html.match(/disabled=""/g)).toBeNull();
    expect(render(false).match(/disabled=""/g)).toHaveLength(2);
    expect(render(true)).toContain('Corrigée');
    expect(render(true)).not.toContain('Correction validée');
  });
});

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
    expect(html).not.toContain('copy-review-student-caption');
    expect(html).not.toContain('copy-review-header-footer');
    expect(html).toContain('copy-review-header-actions');
    expect(html).toContain('copy-review-position-label');
    expect(html).toContain('Modifier le nom de l’étudiant');
    expect(html).toContain('Note proposée');
    expect(html).toContain('Parcourir les copies');
    expect(html).not.toContain('id="student-label"');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('Copie 3 / 12');
    expect(html).toContain('aria-label="Copie 3 sur 12"');
    expect(html).toContain('À vérifier');
    expect(html).toContain('14,5 / 20');
    expect(html).not.toContain('Valider et passer à la suivante');
    expect(html).not.toContain('Correction validée');
    expect(html).toContain('title="Copie suivante : Dupont · En attente"');
    expect(html).toContain('title="Copie précédente : Martin · À reprendre"');
  });

  it('does not present a queued or running copy as graded zero', () => {
    const render = (status: 'En attente' | 'Analyse en cours' | 'À reprendre', score: number | null) => renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Copie sans nom" {...callbacks} position={1} totalCopies={1}
      status={status} score={score} maximumPoints={11} isFinalized={false}
      canPrevious={false} canNext={false}
    />);
    expect(render('En attente', null)).toContain('Note à venir');
    expect(render('En attente', 0)).toContain('Note à venir');
    expect(render('Analyse en cours', 0)).toContain('Évaluation en cours');
    expect(render('À reprendre', null)).toContain('Note indisponible');
    expect(render('En attente', null)).not.toContain('0 / 11');
  });

  it('keeps a real zero readable once the grade is available', () => {
    const html = renderToStaticMarkup(<CopyReviewHeader
      studentLabel="Copie à vérifier" {...callbacks} position={1} totalCopies={1}
      status="À vérifier" score={0} maximumPoints={11} isFinalized={false}
      canPrevious={false} canNext={false}
    />);
    expect(html).toContain('0 / 11');
    expect(html).not.toContain('Note à venir');
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
    expect(render(true)).toContain('Note enregistrée');
    expect(render(true)).not.toContain('Correction validée');
  });
});

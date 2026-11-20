import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReviewAttentionSummary } from '../../src/correction/ui/components/ReviewAttentionSummary.tsx';

const onShowOnlyFlaggedChange = vi.fn();
const render = (changes: Partial<Parameters<typeof ReviewAttentionSummary>[0]> = {}) => renderToStaticMarkup(
  <ReviewAttentionSummary flaggedCriteriaCount={1} reliableCriteriaCount={3} readingNeedsReview={true}
    showOnlyFlagged={false} onShowOnlyFlaggedChange={onShowOnlyFlaggedChange} {...changes} />,
);

describe('ReviewAttentionSummary', () => {
  it('shows the flagged count only once, alongside other criteria and the reading warning', () => {
    const html = render();
    expect(html.match(/1 critère à vérifier sur la copie/g)).toHaveLength(1);
    expect(html).toContain('3 autres critères sans alerte');
    expect(html).toContain('Lecture à vérifier sur l’image');
    expect(html).toContain('Voir uniquement à vérifier');
    expect(html).not.toContain('copy-review-alert-strip');
    expect(html).not.toContain('review-criteria-toolbar');
  });

  it('offers a clear reverse filter and does not repeat the counter in a second button', () => {
    const html = render({ showOnlyFlagged: true, flaggedCriteriaCount: 2, readingNeedsReview: false });
    expect(html).toContain('2 critères à vérifier sur la copie');
    expect(html).toContain('Voir tous les critères');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('Lecture à vérifier sur l’image');
    expect(html).not.toContain('critère(s) à examiner');
  });

  it('hides the irrelevant filter when there are no flagged criteria', () => {
    const html = render({ flaggedCriteriaCount: 0, reliableCriteriaCount: 4, readingNeedsReview: false });
    expect(html).toContain('Proposition de correction');
    expect(html).toContain('4 autres critères sans alerte');
    expect(html).not.toContain('review-criteria-filter');
  });
});

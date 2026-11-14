import type { TimelinePoint } from './radarTimeline.ts';

/** Each entry is the representative campaign already selected for one method. */
export function radarCriterionLeaders(campaigns: readonly TimelinePoint[], criterion: string) {
  const scores = campaigns.flatMap(campaign => {
    const value = campaign.axes[criterion];
    if (value == null || !Number.isFinite(value)) return [];
    // Rank at the precision shown in the radar.
    return [{ method: campaign.label, tenths: Math.round(value * 10) }];
  }).sort((a, b) => b.tenths - a.tenths || a.method.localeCompare(b.method, 'fr'));
  const best = scores[0];
  const next = scores[1];
  return {
    count: scores.length,
    leaders: scores.filter(entry => entry.tenths === best?.tenths).map(entry => entry.method),
    score: best ? best.tenths / 10 : null,
    lead: best && next ? (best.tenths - next.tenths) / 10 : null,
  };
}

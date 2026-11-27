import type { Rubric } from '../../correction/api/index.ts';

/** Decode only the structured, redacted client preview. No model text, image,
 * request ID, endpoint, raw arguments or unrecognised label is copied. */
export function exportedZoomDiagnostics(payload: string | undefined, rubric?: Rubric) {
  if (!payload) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { return undefined; }
  const object = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : undefined;
  const attempts = object(parsed)?.attempts;
  if (!Array.isArray(attempts)) return undefined;
  const measured = (value: unknown, maximum: number): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
      ? Math.round(value) : null;
  const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const events = attempts.flatMap((attempt: unknown) => {
    const zoom = object(object(attempt)?.smartZoom);
    if (!zoom || (zoom.status !== 'inspected' && zoom.status !== 'rejected')) return [];
    const region = object(zoom.region);
    const page = region?.page, x = region?.x, y = region?.y, width = region?.width, height = region?.height;
    const validRegion = number(page) && Number.isSafeInteger(page) && page >= 1 && page <= 1000
      && number(x) && number(y) && number(width) && number(height)
      && x >= 0 && y >= 0 && width >= 0.04 && width <= 0.8 && height >= 0.04 && height <= 0.8
      && x + width <= 1.000001 && y + height <= 1.000001;
    const criterion = rubric?.criteria.find((item, index) =>
      zoom.criterion === (index + 1) + '/' + rubric.criteria.length + ' · ' + item.title);
    return [{
      status: zoom.status,
      criterionId: criterion?.id ?? null,
      region: validRegion ? { page, x, y, width, height } : null,
      cropWidth: measured(zoom.cropWidth, 1600),
      cropHeight: measured(zoom.cropHeight, 1600),
      cropMs: measured(zoom.cropMs, 24 * 3600 * 1000),
    }];
  });
  // Older traces without the tool offered are unmeasured, not zero zooms.
  const offered = attempts.some((attempt: unknown) => {
    const value = object(attempt);
    return value?.input === '[TEXT / IMAGE REDACTED]' &&
      Array.isArray(value.tools) && value.tools.includes('inspect_region');
  });
  if (!offered && events.length === 0) return undefined;
  return {
    offered,
    observedRequests: events.length,
    cropsPrepared: events.filter(event => event.status === 'inspected').length,
    rejected: events.filter(event => event.status === 'rejected').length,
    events,
  };
}

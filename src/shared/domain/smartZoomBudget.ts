export const DEFAULT_ZOOM_BUDGET = 6;
export function parseZoomBudget(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10 ? value : undefined;
}

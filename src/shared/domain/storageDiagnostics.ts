/** Storage measurements are intentionally metadata-only: never retain copy content. */
export interface IndexedDbStoreUsage {
  store: string;
  label: string;
  records: number;
  /** Rough in-memory UTF-16 footprint, NOT browser-reported disk bytes. */
  logicalBytes: number;
}

export interface StorageDiagnosticsSnapshot {
  measuredAt: string;
  /** Browser estimate for the whole web origin (IndexedDB, Cache API, etc.). */
  originUsageBytes: number | null;
  originQuotaBytes: number | null;
  persistent: boolean | null;
  stores: IndexedDbStoreUsage[];
  warnings: string[];
}

const LABELS: Record<string,string> = {
  'local-corrections': 'Copies et corrections',
  'background-corrections': 'Corrections en attente',
  'background-transcriptions': 'Transcriptions temporaires',
  'model-evaluations': 'Évaluations de modèles',
  'diagnostic-history': 'Traces techniques',
  'local-memory': 'Mémoire locale',
};

export function storageStoreLabel(store: string): string {
  return LABELS[store] ?? 'Autres données locales';
}

export function formatStorageBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'Non disponible';
  const units = ['o','Ko','Mo','Go','To'];
  let scaled = bytes, index = 0;
  while (scaled >= 1024 && index < units.length - 1) { scaled /= 1024; index += 1; }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: scaled >= 100 ? 0 : 1 }).format(scaled) + ' ' + units[index];
}

export function storageOccupancyPercent(usage: number | null, quota: number | null): number | null {
  if (usage === null || quota === null || !Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0 || usage < 0) return null;
  return Math.min(100, Math.round(usage / quota * 1000) / 10);
}

/** IndexedDB does not expose store byte sizes. Approximate the logical UTF-16
 * value footprint without serializing or duplicating potentially huge base64
 * images. This MUST NOT be presented as physical on-disk usage. */
export function approximateValueBytes(value: unknown, seen = new WeakSet<object>(), depth = 0): number {
  if (value == null) return 4;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') return 8;
  if (typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof Date) return 16;
  if (depth >= 40) return 0;
  if (Array.isArray(value)) return value.reduce<number>((sum, entry) => sum + approximateValueBytes(entry, seen, depth + 1), 0);
  return Object.entries(value).reduce((sum, [key, entry]) =>
    sum + key.length * 2 + approximateValueBytes(entry, seen, depth + 1), 0);
}

export interface AppBuildVersion {
  version: string;
  revision: string | null;
}

export type AppVersionStatus = 'current' | 'outdated' | 'unverified';

const isCommitRevision = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{7,40}$/i.test(value);

/** Only declare a build up-to-date when both complete revision identifiers match. */
export function compareAppVersions(installed: AppBuildVersion, published: unknown): AppVersionStatus {
  if (!published || typeof published !== 'object') return 'unverified';
  const candidate = published as Partial<AppBuildVersion>;
  if (typeof candidate.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(candidate.version)) {
    return 'unverified';
  }
  if (candidate.version !== installed.version) return 'outdated';
  if (!isCommitRevision(installed.revision) || !isCommitRevision(candidate.revision)) return 'unverified';
  return installed.revision === candidate.revision ? 'current' : 'outdated';
}

export function shortAppRevision(revision: string | null): string {
  return isCommitRevision(revision) ? revision.slice(0, 7) : 'local';
}


/** Only CI-generated release tags may become links in the version panel. */
export function appReleaseUrl(tag: string | null | undefined): string | null {
  if (!tag || !/^companion-auto-[1-9]\d*-[a-f0-9]{40}$/.test(tag)) return null;
  return `https://github.com/Sims07/Companion-Correcteur-Devoir/releases/tag/${tag}`;
}

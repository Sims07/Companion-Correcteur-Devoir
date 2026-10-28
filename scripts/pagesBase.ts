export const GITHUB_PAGES_BASE = '/Companion-Correcteur-Devoir/';

export function resolveBasePath(isGithubActions: boolean): string {
  return isGithubActions ? GITHUB_PAGES_BASE : '/';
}

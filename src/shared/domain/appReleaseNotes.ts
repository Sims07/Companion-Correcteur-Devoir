import { appReleaseUrl } from './appBuildVersion.ts';

/** Releases are created after deployment, so the published changelog is loaded on demand. */
export function appReleaseApiUrl(tag: string | null | undefined): string | null {
  if (!appReleaseUrl(tag)) return null;
  return `https://api.github.com/repos/Sims07/Companion-Correcteur-Devoir/releases/tags/${tag}`;
}

/** Display GitHub's generated PR descriptions as plain, teacher-readable text. */
export function readAppReleaseNotes(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || typeof (payload as { body?: unknown }).body !== 'string') return [];
  const lines = (payload as { body: string }).body.split(/\r?\n/);
  const notes: string[] = [];
  let inChanges = false;
  for (const line of lines) {
    if (/^##\s+What'?s Changed\s*$/i.test(line.trim())) {
      inChanges = true;
      continue;
    }
    if (!inChanges) continue;
    if (/^##\s+/.test(line) || /^\*\*Full Changelog\*\*/i.test(line.trim())) break;
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (!item) continue;
    const withoutAttribution = item[1]
      .replace(/\s+by\s+@[\w-]+\s+in\s+https:\/\/github\.com\/Sims07\/Companion-Correcteur-Devoir\/pull\/\d+\s*$/i, '')
      .replace(/^(?:feat|fix|docs|refactor|perf|test|chore|style|build|ci)(?:\([^)]*\))?!?:\s*/i, '')
      .replace(/\bLLM\b/g, 'IA')
      .trim();
    if (!withoutAttribution) continue;
    const title = withoutAttribution.slice(0, 250);
    notes.push(title.charAt(0).toLocaleUpperCase('fr-FR') + title.slice(1));
    if (notes.length === 6) break;
  }
  return notes;
}

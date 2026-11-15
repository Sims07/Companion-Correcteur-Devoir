import { describe, expect, it } from 'vitest';
import { appReleaseApiUrl, readAppReleaseNotes } from '../src/shared/domain/appReleaseNotes.ts';

describe('version release notes', () => {
  const tag = 'companion-auto-2697-' + 'e'.repeat(40);

  it('only requests notes for an automatic release of this application', () => {
    expect(appReleaseApiUrl(tag)).toBe('https://api.github.com/repos/Sims07/Companion-Correcteur-Devoir/releases/tags/' + tag);
    expect(appReleaseApiUrl(null)).toBeNull();
    expect(appReleaseApiUrl('https://attacker.example')).toBeNull();
    expect(appReleaseApiUrl('v0.3.0')).toBeNull();
  });

  it('removes GitHub metadata and conventional commit prefixes without inventing features', () => {
    const notes = readAppReleaseNotes({ body: [
      '## What\'s Changed',
      '* feat(laboratoire): analyser un schéma personnel en un seul passage by @Sims07 in https://github.com/Sims07/Companion-Correcteur-Devoir/pull/484',
      '* fix(radar): permettre la correction directe par LLM by @Sims07 in https://github.com/Sims07/Companion-Correcteur-Devoir/pull/483',
      '',
      '**Full Changelog**: https://github.com/other',
      '* An irrelevant changelog entry',
    ].join('\n') });
    expect(notes).toEqual([
      'Analyser un schéma personnel en un seul passage',
      'Permettre la correction directe par IA',
    ]);
  });

  it('does not confuse other release sections with the list of changes', () => {
    expect(readAppReleaseNotes({ body: '## New Contributors\n* @person\n## What\'s Changed\n* docs: Aide à la correction\n## New Contributors\n* @someone' }))
      .toEqual(['Aide à la correction']);
    expect(readAppReleaseNotes({ body: 'Une note sans rubrique de changements' })).toEqual([]);
    expect(readAppReleaseNotes({ body: null })).toEqual([]);
    expect(readAppReleaseNotes(null)).toEqual([]);
  });

  it('bounds the number and size of displayed release items', () => {
    const body = '## What\'s Changed\n' + Array.from({ length: 9 }, (_, i) => '* feat: ' + i + ' '.repeat(300)).join('\n');
    const notes = readAppReleaseNotes({ body });
    expect(notes).toHaveLength(6);
    expect(notes.every((note) => note.length <= 250)).toBe(true);
  });
});

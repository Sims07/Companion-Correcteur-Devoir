import { describe, expect, it } from 'vitest';
import { appReleaseUrl, compareAppVersions, shortAppRevision } from '../src/domain/appBuildVersion.ts';

const installed = { version: '0.3.0', revision: 'a'.repeat(40) };

describe('application build version', () => {
  it('compares actual revisions rather than assuming matching semantic versions are current', () => {
    expect(compareAppVersions(installed, { ...installed })).toBe('current');
    expect(compareAppVersions(installed, { version: '0.3.0', revision: 'b'.repeat(40) })).toBe('outdated');
    expect(compareAppVersions(installed, { version: '0.4.0', revision: 'b'.repeat(40) })).toBe('outdated');
  });

  it('never declares an unverified or local build up to date', () => {
    expect(compareAppVersions(installed, null)).toBe('unverified');
    expect(compareAppVersions(installed, { version: '0.3.0' })).toBe('unverified');
    expect(compareAppVersions(installed, { version: '<script>', revision: 'a'.repeat(40) })).toBe('unverified');
    expect(compareAppVersions({ version: '0.3.0', revision: null }, installed)).toBe('unverified');
    expect(shortAppRevision(null)).toBe('local');
    expect(shortAppRevision('a'.repeat(40))).toBe('aaaaaaa');
  });

  it('links only automatic release tags and keeps local/legacy builds on their commit fallback', () => {
    const tag = 'companion-auto-123-' + 'a'.repeat(40);
    expect(appReleaseUrl(tag)).toBe('https://github.com/Sims07/Companion-Correcteur-Devoir/releases/tag/' + tag);
    expect(appReleaseUrl(null)).toBeNull();
    expect(appReleaseUrl('v0.3.0')).toBeNull();
    expect(appReleaseUrl('companion-auto-0-' + 'a'.repeat(40))).toBeNull();
    expect(appReleaseUrl('companion-auto-123-' + 'z'.repeat(40))).toBeNull();
    expect(appReleaseUrl('companion-auto-123-abc/../../other')).toBeNull();
  });
});

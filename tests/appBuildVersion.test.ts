import { describe, expect, it } from 'vitest';
import { compareAppVersions, shortAppRevision } from '../src/domain/appBuildVersion.ts';

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
});

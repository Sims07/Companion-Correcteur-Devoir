// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scienceMethods } from '../../../src/evaluation/domain/radarTimeline.ts';
import { biologyMethodLabels } from '../../../src/evaluation/domain/radarMethodExclusions.ts';
import {
  DEFAULT_BIOLOGY_METHOD_STATUSES, DEFAULT_DIAGRAM_METHOD_STATUSES, EMPTY_RADAR_METHOD_STATUSES,
  RADAR_METHOD_STATUS_GROUPS, loadRadarMethodStatuses, parseRadarMethodStatuses,
  radarMethodStatus, saveRadarMethodStatuses, updateRadarMethodStatus,
} from '../../../src/evaluation/domain/radarMethodStatuses.ts';

beforeEach(() => window.localStorage.clear());

describe('suivi des méthodes du laboratoire', () => {
  it('classe toutes les méthodes canoniques dans exactement trois groupes et privilégie la correction directe', () => {
    expect(RADAR_METHOD_STATUS_GROUPS.map(group => group.label)).toEqual([
      'Potentiellement utilisable', 'En cours d’évaluation', 'Mis de côté',
    ]);
    expect(Object.keys(DEFAULT_DIAGRAM_METHOD_STATUSES).sort()).toEqual(Object.keys(scienceMethods).sort());
    expect(Object.keys(DEFAULT_BIOLOGY_METHOD_STATUSES).sort()).toEqual(Object.keys(biologyMethodLabels).sort());
    expect(Object.entries(DEFAULT_DIAGRAM_METHOD_STATUSES).filter(([, status]) => status === 'candidate')
      .map(([id]) => id)).toEqual(['image-direct-v1']);
    expect(DEFAULT_DIAGRAM_METHOD_STATUSES['vision-then-analysis']).toBe('shelved');
    expect(DEFAULT_BIOLOGY_METHOD_STATUSES.pilot).toBe('shelved');
  });

  it('persiste un reclassement local par domaine sans modifier le statut des autres méthodes', () => {
    const next = updateRadarMethodStatus(EMPTY_RADAR_METHOD_STATUSES, 'diagrams', 'pixel-v1', 'candidate');
    expect(next).not.toBe(EMPTY_RADAR_METHOD_STATUSES);
    expect(radarMethodStatus(next, 'diagrams', 'pixel-v1')).toBe('candidate');
    expect(radarMethodStatus(next, 'diagrams', 'image-direct-v1')).toBe('candidate');
    expect(radarMethodStatus(next, 'biology', 'pilot')).toBe('shelved');
    expect(saveRadarMethodStatuses(next)).toBe(true);
    expect(loadRadarMethodStatuses()).toEqual(next);
    const reset = updateRadarMethodStatus(next, 'diagrams', 'pixel-v1', 'shelved');
    expect(reset.diagrams).toEqual({});
    expect(next.diagrams['pixel-v1']).toBe('candidate');
  });

  it('rejette les statuts incohérents et les ids étrangers, avec repli fiable', () => {
    const parsed = parseRadarMethodStatuses({
      diagrams: { 'pixel-v1': 'evaluating', 'missing': 'candidate', 'leaders-v1': 'invalid' },
      biology: { 'pilot': 'candidate', 'image-direct-v1': 'shelved' },
    });
    expect(parsed).toEqual({ diagrams: { 'pixel-v1': 'evaluating' }, biology: { pilot: 'candidate' } });
    expect(parseRadarMethodStatuses([])).toEqual({ diagrams: {}, biology: {} });
    expect(updateRadarMethodStatus(parsed, 'diagrams', 'missing', 'candidate')).toBe(parsed);
    window.localStorage.setItem('companion:radar-method-statuses:v1', 'not-json');
    expect(loadRadarMethodStatuses()).toEqual({ diagrams: {}, biology: {} });
  });

  it('signale un stockage local impossible au lieu de promettre une sauvegarde', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    try { expect(saveRadarMethodStatuses(EMPTY_RADAR_METHOD_STATUSES)).toBe(false); }
    finally { spy.mockRestore(); }
  });
});

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration, type AiModelProfile } from '../../src/domain/aiModelProfiles.ts';
import type { RadarMissingTestRequest } from '../../src/domain/diagramLabRadarLaunch.ts';
import { ScientificDiagramProtocolPanel } from '../../src/ui/components/ScientificDiagramProtocolPanel.tsx';
import type { buildScientificDiagramFixtureReport } from '../../src/domain/scientificDiagramFixtures.ts';

const profile: AiModelProfile = {
  id: 'saved-profile', name: 'Qwen Vision', mode: 'single', updatedAt: '2026-11-10T10:00:00Z',
  configuration: { ...defaultAiModelConfiguration, visionModel: 'vision:4b',
    analysisModel: 'vision:4b', generativeModel: 'vision:4b', correctionMethod: 'generative' },
};
const plan: RadarMissingTestRequest = {
  id: 42, profileId: profile.id, profileName: profile.name, axis: 'graphics',
  steps: [{ protocol: 'reference', repetitions: 1, method: 'direct-image-generative',
    promptMode: 'standard', graphVariant: 'baseline', zoom: false }],
};

afterEach(() => vi.unstubAllGlobals());

describe('scientific automatic protocol runner invoked from radar', () => {
  it('starts exactly one existing A/B/C protocol for the targeted saved profile, with no manual upload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true,
      blob: async () => new Blob(['fake-webp'], { type: 'image/webp' }),
    })));
    const container = document.createElement('div');
    const root = createRoot(container);
    const onRunFixtures = vi.fn(async (request: { cases: { id: string }[] }) => ({
      cases: request.cases.map(({ id }) => ({ caseId: id, experiments: [{ status: 'success' }] })),
    } as unknown as ReturnType<typeof buildScientificDiagramFixtureReport>));
    const onPrepareImages = vi.fn(async (files: File[]) => files.map((file) => ({
      fileName: file.name, base64: 'ZmFrZQ==', mimeType: file.type,
    })));
    const consumed = vi.fn();
    const busyChange = vi.fn();
    const props = {
      selectedProfiles: [profile], busy: false, progress: '', onPrepareImages,
      onRun: vi.fn(), onRunFixtures, onRunSensitivity: vi.fn(), onRunBlindGraph: vi.fn(),
      onStop: vi.fn(), report: null, fixtureReport: null, sensitivityReport: null, blindGraphReport: null,
      onClearReport: vi.fn(), onClearFixtureReport: vi.fn(), onClearSensitivityReport: vi.fn(),
      onClearBlindGraphReport: vi.fn(), autoRequest: plan,
      onAutoRequestConsumed: consumed, onAutoBusyChange: busyChange,
    };
    await act(async () => root.render(createElement(ScientificDiagramProtocolPanel, props)));
    await vi.waitFor(() => expect(onRunFixtures).toHaveBeenCalledTimes(1));
    const actual = onRunFixtures.mock.calls[0]![0];
    expect(actual.cases.map((item) => item.id)).toEqual(['A', 'B', 'C']);
    expect(onPrepareImages).toHaveBeenCalledTimes(3);
    expect(consumed).toHaveBeenCalledOnce();
    expect(consumed).toHaveBeenCalledWith(42);
    expect(busyChange).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(busyChange).toHaveBeenLastCalledWith(false));
    expect(container.textContent).toContain('Batteries terminées');
    await act(async () => root.render(createElement(ScientificDiagramProtocolPanel, props)));
    expect(onRunFixtures).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('waits for exact profile selection, never calls a different configured model', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const consumed = vi.fn(), executed = vi.fn();
    const props = {
      selectedProfiles: [], busy: false, progress: '', onPrepareImages: vi.fn(),
      onRun: vi.fn(), onRunFixtures: executed, onRunSensitivity: vi.fn(), onRunBlindGraph: vi.fn(),
      onStop: vi.fn(), report: null, fixtureReport: null, sensitivityReport: null, blindGraphReport: null,
      onClearReport: vi.fn(), onClearFixtureReport: vi.fn(), onClearSensitivityReport: vi.fn(),
      onClearBlindGraphReport: vi.fn(), autoRequest: plan, onAutoRequestConsumed: consumed,
    };
    await act(async () => root.render(createElement(ScientificDiagramProtocolPanel, props)));
    expect(consumed).not.toHaveBeenCalled();
    expect(executed).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});

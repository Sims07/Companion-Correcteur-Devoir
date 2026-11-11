import { describe, expect, it, vi } from 'vitest';
import { directDiagramSchema, parseDirectDiagramOutput } from '../../../src/adapters/ai/directDiagramOutput.ts';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { diagramAnalysisDiagnostics, diagramFailureCategory } from '../../../src/domain/scientificDiagramProtocol.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC } from '../../../src/domain/scientificDiagramFixtures.ts';

const criteria = [{ id: 'title', title: 'Titre', description: '', maxPoints: 1,
  subcriteria: [{ id: 'position', title: 'Position', description: '', maxPoints: 0.66 },
    { id: 'content', title: 'Contenu', description: '', maxPoints: 0.34 }] }];
const answer = () => ({ criteria: { title: { evidence: 'Titre sous le dessin', confidence: 'medium', questionForTeacher: '',
  subcriteria: { position: { points: 0.33, evidence: 'Titre décalé' }, content: { points: 0.34, evidence: 'Sujet précisé' } } } } });
const stream = (raw: string, done_reason = 'stop') => new Response(
  JSON.stringify({ message: { content: raw } }) + '\n' + JSON.stringify({ done: true, done_reason }) + '\n');
const request = { question: 'Vérifier le dessin', rubric: JSON.stringify({ title: 'Dessin', criteria }),
  images: [{ mimeType: 'image/png', base64: 'aW1hZ2U=', fileName: 'copy.png' }], directGenerativeVision: true };

describe('compact direct diagram output', () => {
  it('handles all 19 real fixture targets with mixed zero, partial and maximum marks', () => {
    const rubric = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC;
    const values = Object.fromEntries(rubric.criteria.map(c => [c.id, {
      evidence: 'Observation du dessin', confidence: 'medium', questionForTeacher: '',
      subcriteria: Object.fromEntries(c.subcriteria!.map((s, i) => [s.id, {
        points: i % 3 === 0 ? 0 : i % 3 === 1 ? 0.1 : s.maxPoints, evidence: 'Détail visible',
      }])),
    }]));
    const parsed = JSON.parse(parseDirectDiagramOutput(JSON.stringify({ criteria: values }), rubric.criteria));
    expect(parsed.criteria.flatMap((c: {subcriteria: unknown[]}) => c.subcriteria)).toHaveLength(19);
    expect(parsed.finalScore).toBeGreaterThan(0);
    expect(parsed.finalScore).toBeLessThan(10);
  });
  it('computes partial decimal totals without asking the model to add or changing leaf marks', () => {
    const parsed = JSON.parse(parseDirectDiagramOutput(JSON.stringify(answer()), criteria));
    expect(parsed.finalScore).toBe(0.67);
    expect(parsed.criteria[0].points).toBe(0.67);
    expect(parsed.criteria[0].subcriteria.map((s: {points: number}) => s.points)).toEqual([0.33, 0.34]);
  });
  it('requires each real rubric ID as a named schema property, not alternatives in an array', () => {
    const schema = directDiagramSchema(criteria);
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).toContain('position');
    expect(JSON.stringify(schema)).not.toContain('finalScore');
    expect(schema.properties.criteria.properties.title.properties.subcriteria.properties.position.properties.points)
      .toMatchObject({ type: 'number', minimum: 0, maximum: 0.66 });
    expect(JSON.stringify(schema)).not.toContain('creditFraction');
  });
  it.each(['missing-id', 'unknown-id', 'missing-evidence', 'invalid-points'])(
    'does not fabricate or clamp marks after %s', code => {
      const value = answer();
      if (code === 'missing-id') delete (value.criteria.title.subcriteria as Partial<typeof value.criteria.title.subcriteria>).position;
      if (code === 'unknown-id') Object.assign(value.criteria.title.subcriteria, { invented: { points: 0, evidence: 'x' } });
      if (code === 'missing-evidence') value.criteria.title.subcriteria.position.evidence = '';
      if (code === 'invalid-points') value.criteria.title.subcriteria.position.points = 1;
      expect(() => parseDirectDiagramOutput(JSON.stringify(value), criteria)).toThrow(`[diagram-output:${code}]`);
    });
  it('accepts a completely absent diagram with zero on every scientific subcriterion', () => {
    const rubric = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC;
    const values = Object.fromEntries(rubric.criteria.map(c => [c.id, {
      evidence: 'Attendus absents du dessin', confidence: 'high', questionForTeacher: '',
      subcriteria: Object.fromEntries(c.subcriteria!.map(s => [s.id, {
        points: 0, evidence: 'Élément non dessiné',
      }])),
    }]));
    const parsed = JSON.parse(parseDirectDiagramOutput(JSON.stringify({ criteria: values }), rubric.criteria));
    expect(parsed.finalScore).toBe(0);
    expect(parsed.criteria.flatMap((c: { subcriteria: unknown[] }) => c.subcriteria)).toHaveLength(19);
  });
  it('pinpoints invalid marks without silently coercing them', () => {
    const bad = answer();
    bad.criteria.title.subcriteria.position.points = -0.33;
    expect(() => parseDirectDiagramOutput(JSON.stringify(bad), criteria))
      .toThrow(/\[diagram-output:invalid-points\].*title\.subcriteria\.position\.points.*entre 0 et 0\.66.*-0\.33/);
    const notANumber = JSON.stringify(answer()).replace('"points":0.33', '"points":"0.33"');
    expect(() => parseDirectDiagramOutput(notANumber, criteria))
      .toThrow(/\[diagram-output:invalid-points\].*position\.points.*reçu : string/);
  });

  it('preserves the original C model decisions: 18 zeros and only the horizontal title at 0.33 points', () => {
    const rubric = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC;
    const result = Object.fromEntries(rubric.criteria.map(criterion => [criterion.id, {
      evidence: 'Constat depuis le dessin', confidence: 'high', questionForTeacher: '',
      subcriteria: Object.fromEntries(criterion.subcriteria!.map(sub => [sub.id, {
        points: sub.id === 'title-horizontal' ? sub.maxPoints : 0,
        evidence: sub.id === 'title-horizontal'
          ? 'Le titre est écrit horizontalement.' : 'Attendu absent ou incorrect.',
      }])),
    }]));
    const output = JSON.parse(parseDirectDiagramOutput(JSON.stringify({ criteria: result }), rubric.criteria));
    const all = output.criteria.flatMap((criterion: {subcriteria: {subcriterionId: string; points: number}[]}) => criterion.subcriteria);
    expect(all).toHaveLength(19);
    expect(output.finalScore).toBe(0.33);
    expect(all.filter((sub: {points: number}) => sub.points > 0)).toEqual([
      { subcriterionId: 'title-horizontal', points: 0.33, evidence: 'Le titre est écrit horizontalement.' },
    ]);
    expect(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap(c => c.subcriteria!)
      .find(sub => sub.id === 'title-horizontal')?.maxPoints).toBe(0.33);
  });

  it('uses a targeted repair for the original binary 1 error without redistributing zero points', async () => {
    const rubric = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC;
    const make = (horizontalPoints: number) => ({ criteria: Object.fromEntries(rubric.criteria.map(criterion => [
      criterion.id, {
        evidence: 'Observation visuelle du dessin', confidence: 'high', questionForTeacher: '',
        subcriteria: Object.fromEntries(criterion.subcriteria!.map(sub => [sub.id, {
          points: sub.id === 'title-horizontal' ? horizontalPoints : 0,
          evidence: sub.id === 'title-horizontal' ? 'Le titre est écrit horizontalement.' : 'Attendu absent.',
        }])),
      },
    ])) });
    const mock = vi.fn().mockResolvedValueOnce(stream(JSON.stringify(make(1))))
      .mockResolvedValueOnce(stream(JSON.stringify(make(0.33))));
    const raw = await createOllamaProvider({ endpoint: 'http://localhost:11434',
      analysisModel: 'qwen3.5:4b', correctionMethod: 'generative' }, mock).generate({
        ...request, rubric: JSON.stringify(rubric),
      });
    expect(mock).toHaveBeenCalledTimes(2);
    const output = JSON.parse(raw);
    const all = output.criteria.flatMap((c: {subcriteria: {points: number}[]}) => c.subcriteria);
    expect(all.filter((s: {points: number}) => s.points > 0)).toHaveLength(1);
    expect(output.finalScore).toBe(0.33);
    const bodies = mock.mock.calls.map(c => JSON.parse(String(c[1]?.body)));
    expect(bodies[0].format.properties.criteria.properties.title.properties.subcriteria.properties['title-horizontal'].properties.points)
      .toMatchObject({ minimum: 0, maximum: 0.33 });
    expect(bodies[0].messages[0].content).toContain('maxPoints: 0.33');
    expect(bodies[0].messages[0].content).not.toContain('creditFraction');
    expect(bodies[1].messages[0].content).toContain('title.subcriteria.title-horizontal.points');
    expect(bodies[1].messages[0].content).toContain('entre 0 et 0.33');
    expect(bodies[1].messages[0].images).toEqual(bodies[0].messages[0].images);
  });

  it('repairs a negative mark on a poor diagram while preserving the zero score', async () => {
    const bad = answer();
    bad.criteria.title.subcriteria.position.points = -0.33;
    const corrected = answer();
    corrected.criteria.title.subcriteria.position.points = 0;
    corrected.criteria.title.subcriteria.content.points = 0;
    const fetchMock = vi.fn().mockResolvedValueOnce(stream(JSON.stringify(bad)))
      .mockResolvedValueOnce(stream(JSON.stringify(corrected)));
    const raw = await createOllamaProvider({ endpoint: 'http://localhost:11434',
      analysisModel: 'qwen3.5:4b', correctionMethod: 'generative' }, fetchMock).generate(request);
    expect(JSON.parse(raw).finalScore).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const repair = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(first.messages[0].content).toContain('jamais une chaîne, null ou une pénalité négative');
    expect(repair.messages[0].content).toContain('title.subcriteria.position.points');
    expect(repair.messages[0].content).toContain('entre 0 et 0.66');
    expect(repair.messages[0].images).toEqual(first.messages[0].images);
  });
  it('rejects a repeated invalid mark rather than manufacturing a score', async () => {
    const bad = answer();
    bad.criteria.title.subcriteria.position.points = -0.5;
    const fetchMock = vi.fn(async () => stream(JSON.stringify(bad)));
    await expect(createOllamaProvider({ endpoint: 'http://localhost:11434',
      analysisModel: 'qwen3.5:4b', correctionMethod: 'generative' }, fetchMock).generate(request))
      .rejects.toThrow(/\[diagram-output:invalid-points\].*position\.points/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['qwen3.5:4b', 'qwen3.5:9b'])('repairs only once with images and exact IDs for %s', async model => {
    const bad = answer();
    delete (bad.criteria.title.subcriteria as Partial<typeof bad.criteria.title.subcriteria>).position;
    const fetchMock = vi.fn().mockResolvedValueOnce(stream(JSON.stringify(bad))).mockResolvedValueOnce(stream(JSON.stringify(answer())));
    const trace = vi.fn();
    const raw = await createOllamaProvider({ endpoint: 'http://localhost:11434', analysisModel: model,
      correctionMethod: 'generative' }, fetchMock).generate(request, undefined, undefined, undefined, trace);
    expect(JSON.parse(raw).finalScore).toBe(0.67);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(c => JSON.parse(c[1].body));
    for (const body of bodies) {
      expect(body.model).toBe(model);
      expect(body.think).toBe(false);
      expect(body.messages[0].images).toEqual(['aW1hZ2U=']);
      expect(body.messages[0].content).not.toContain('transcription_etudiant');
    }
    expect(bodies[1].messages[0].content).toContain('missing-id');
    expect(trace.mock.calls.map(c => c[0].promptId)).toEqual(['diagram.direct-grading', 'diagram.direct-repair']);
  });
  it('rejects a second invalid answer with a safe, exportable validation reason', async () => {
    const fetchMock = vi.fn(async () => stream('{'));
    await expect(createOllamaProvider({ endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:4b',
      correctionMethod: 'generative' }, fetchMock).generate(request)).rejects.toThrow('[diagram-output:invalid-json]');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const error = 'secret [diagram-output:invalid-json]';
    expect(diagramAnalysisDiagnostics({ error }).outputFailure).toBe('invalid-json');
    expect(JSON.stringify(diagramAnalysisDiagnostics({ error }))).not.toContain('secret');
    expect(diagramFailureCategory(error)).toBe('invalid-or-incomplete-output');
  });
  it('never accepts a length-stopped answer even if its JSON happens to be valid', async () => {
    const fetchMock = vi.fn(async () => stream(JSON.stringify(answer()), 'length'));
    await expect(createOllamaProvider({ endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:9b',
      correctionMethod: 'generative' }, fetchMock).generate(request)).rejects.toThrow('[diagram-output:generation-limit]');
  });
  it('does not retry a failed HTTP request', async () => {
    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }));
    await expect(createOllamaProvider({ endpoint: 'http://localhost:11434', analysisModel: 'qwen3.5:4b',
      correctionMethod: 'generative' }, fetchMock).generate(request)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps the same compact contract through an OpenAI-compatible multimodal endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('data: ' + JSON.stringify({ choices: [{
      delta: { content: JSON.stringify(answer()) }, finish_reason: 'stop',
    }] }) + '\n\ndata: [DONE]\n', { headers: { 'Content-Type': 'text/event-stream' } }));
    const raw = await createOllamaProvider({ endpoint: 'https://example.invalid/v1/chat/completions',
      apiCompatible: true, analysisModel: 'qwen3.5:9b', correctionMethod: 'generative' }, fetchMock).generate(request);
    expect(JSON.parse(raw).finalScore).toBe(0.67);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps an explicit uncertainty and teacher question in the final proposal', () => {
    const value = answer();
    value.criteria.title.confidence = 'low';
    value.criteria.title.questionForTeacher = 'Le titre est-il coupé sur la photo ?';
    value.criteria.title.evidence = 'preuve non disponible';
    const parsed = JSON.parse(parseDirectDiagramOutput(JSON.stringify(value), criteria));
    expect(parsed.criteria[0].confidence).toBe('low');
    expect(parsed.criteria[0].questionForTeacher).toContain('photo');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createOpenAiScientificDiagramAnalyzer } from './openAiScientificDiagramAnalyzer.ts';

const request = {
  endpoint: 'https://ai.example',
  apiKey: 'secret',
  teacherAnnotations: 'Correction rouge : légende à revoir',
  model: 'vision-model',
  question: 'Dessiner une cellule',
  rubric: { title: 'Barème', criteria: [{ id: 'labels', title: 'Légendes', description: '', maxPoints: 2 }] },
  images: [{ base64: 'cG5n', mimeType: 'image/png' }],
};
const output = { diagrams: [{ id: 'd1', pageNumber: 1, diagramType: 'Cellule', summary: 'Schéma de cellule', criteria: [{ criterionId: 'labels', points: 2, evidence: 'Légendes présentes', confidence: 0.9, requiresTeacherReview: false }], uncertainties: [] }], overallUncertainties: [] };

describe('OpenAI scientific diagram adapter', () => {
  it('classifies every page in an isolated high-detail request and preserves the original page index', async () => {
    const pageOne = { pages: [{ pageNumber: 1, kind: 'text', confidence: 0.98, reason: 'Réponse manuscrite' }] };
    const pageTwo = { pages: [{ pageNumber: 1, kind: 'mixed', confidence: 0.96, reason: 'Schéma biologique et tableau distinct', suggestedRotation: 90, orientationConfidence: 0.97 }] };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(pageOne) } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(pageTwo) } }] }), { status: 200 }));
    const analyzer = createOpenAiScientificDiagramAnalyzer(fetchMock);
    const diagnostic = vi.fn();
    await expect(analyzer.classifyPages({ ...request, onDiagnosticResult: diagnostic, images: [...request.images, { base64: 'cG5nMg==', mimeType: 'image/png' }] })).resolves.toMatchObject([
      { pageNumber: 1, kind: 'text' }, { pageNumber: 2, kind: 'mixed', suggestedRotation: 90, orientationConfidence: 0.97 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(diagnostic).toHaveBeenCalledTimes(2);
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'scientific-diagram-classification', model: 'vision-model' }));
    for (const [index, [url, init]] of fetchMock.mock.calls.entries()) {
      expect(String(url)).toBe('https://ai.example/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      expect(body.max_tokens).toBe(320);
      expect(body.max_completion_tokens).toBeUndefined();
      expect(body.messages[0].content).toHaveLength(2);
      expect(body.messages[0].content[0].text).toContain(`NUMÉRO DE PAGE ORIGINAL : ${index + 1}`);
      expect(body.messages[0].content[0].text).toContain('Les tableaux de données');
      expect(body.messages[0].content[0].text).toContain('Les seules valeurs autorisées pour kind sont text, scientific-diagram, mixed ou ambiguous');
      expect(body.messages[0].content[0].text).toContain('orientationConfidence');
      expect(body.messages[0].content[1].image_url.url).toContain(index === 0 ? 'cG5n' : 'cG5nMg==');
      expect(body.messages[0].content[1].image_url.detail).toBe('high');
    }
  });

  it('sends the original page image and rubric to the configured OpenAI-compatible Vision endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    const analyzer = createOpenAiScientificDiagramAnalyzer(fetchMock);
    const diagnostic = vi.fn();
    await expect(analyzer.analyze({ ...request, onDiagnosticResult: diagnostic })).resolves.toMatchObject({ diagrams: [{ pageNumber: 1, criteria: [{ points: 2, maxPoints: 2 }] }] });
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'scientific-diagram-analysis', model: 'vision-model', raw: JSON.stringify(output), requestPayload: expect.stringContaining('images') }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://ai.example/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('vision-model');
    expect(body.messages[0].content[0].text).toContain('QUESTION : Dessiner une cellule');
    expect(body.max_tokens).toBe(2048);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('CRITÈRES VISUELS') },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,cG5n', detail: 'high' } },
    ]);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });
  it('embeds the exact generated JSON Schema in the prompt so the model knows every required field', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const prompt = body.messages[0].content[0].text as string;
    const schema = body.format;
    expect(prompt).toContain('SCHÉMA JSON À RESPECTER STRICTEMENT');
    expect(prompt).toContain(JSON.stringify(schema));
    expect(schema.required).toEqual(['diagrams', 'criteria', 'overallUncertainties']);
    expect(schema.properties.diagrams.minItems).toBe(1);
    expect(schema.properties.criteria.minItems).toBe(1);
    expect(schema.properties.criteria.maxItems).toBe(1);
    expect(schema.properties.criteria.items.required).toContain('criterionId');
    expect(schema.properties.criteria.items.properties.criterionId.enum).toEqual(['labels']);
    expect(prompt).not.toContain('Exemple indicatif de structure JSON');
  });

  it('accepts a valid Vision diagram response without optional overall uncertainties', async () => {
    const { overallUncertainties: _omitted, ...outputWithoutGlobalUncertainties } = output;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(outputWithoutGlobalUncertainties) } }],
    }), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request))
      .resolves.toMatchObject({ diagrams: [{ criteria: [{ points: 2 }] }], overallUncertainties: [] });
  });
  it('asks Vision for one global score per selected diagram criterion and makes the seven-dimension explanation optional when explicitly marked', async () => {
    const detailedOutput = structuredClone(output) as { diagrams: Array<{ criteria: Array<{ qualityBreakdown?: Array<{ dimension: string; status: string; evidence: string }> }> }> };
    detailedOutput.diagrams[0].criteria[0].qualityBreakdown = [
      { dimension: 'title', status: 'fulfilled', evidence: 'Titre précis.' },
      { dimension: 'scientific-accuracy', status: 'partial', evidence: 'Une structure est imprécise.' },
      { dimension: 'completeness', status: 'fulfilled', evidence: 'Éléments essentiels présents.' },
      { dimension: 'labels', status: 'partial', evidence: 'Deux légendes manquent.' },
      { dimension: 'arrows-relations', status: 'not-applicable', evidence: 'Aucune relation à représenter.' },
      { dimension: 'organization-conventions', status: 'fulfilled', evidence: 'Organisation logique.' },
      { dimension: 'legibility', status: 'fulfilled', evidence: 'Lecture aisée.' },
    ];
    const markedRequest = { ...request, rubric: { title: 'Barème', criteria: [{ id: 'labels', title: 'Qualité du schéma', description: '', maxPoints: 10, analysisMode: 'scientific-diagram' as const }] } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(detailedOutput) } }] }), { status: 200 }));
    const result = await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(markedRequest);
    expect(result.diagrams[0].criteria[0].qualityBreakdown).toHaveLength(7);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const prompt = body.messages[0].content[0].text as string;
    expect(prompt).toContain('UNE seule évaluation par critère');
    expect(prompt).toContain('arrows-relations');
    expect(prompt).toContain('maximum n’est justifié que si tous les attendus essentiels');
  });
  it('records failed diagram Vision calls in observability', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('vision unavailable', { status: 503 }));
    const diagnostic = vi.fn();
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({ ...request, onDiagnosticResult: diagnostic })).rejects.toThrow(/HTTP 503/);
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'scientific-diagram-analysis', error: expect.stringContaining('HTTP 503') }));
  });
  it('does not retry authentication and server errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request)).rejects.toThrow(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('rejects invalid model output rather than inventing a score', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{bad json' } }] }), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request)).rejects.toThrow(/JSON valide/);
  });
  it('never requests more than the 2048-token limit on OpenAI-compatible Vision endpoints', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(output) },
      done_reason: 'stop',
    }), { status: 200 }));
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request);
    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(String(init?.body));
      expect(body.max_tokens).toBeLessThanOrEqual(2048);
    }
  });

  it('retries once with a compact response when the provider reports finish_reason length', async () => {
    const globalOutput = { diagrams: [{ pageNumber: 1, diagramType: 'schéma', summary: '', uncertainties: [] }], criteria: [{ criterionId: 'labels', points: 1, evidence: 'Preuve', confidence: 0.8, requiresTeacherReview: false, diagramIds: ['diagram-1'] }], overallUncertainties: [] };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"diagrams":[' }, finish_reason: 'length' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(globalOutput) }, finish_reason: 'stop' }] }), { status: 200 }));
    const result = await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request);
    expect(result.criteria?.[0].points).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).max_tokens).toBe(2048);
  });
  it('repairs one invalid field and keeps the failed raw answer in diagnostics', async () => {
    const invalid = { diagrams: [{ pageNumber: 1, diagramType: 'schéma', summary: '', uncertainties: [] }], criteria: [{ criterionId: 'labels', points: 3, evidence: 'Preuve', confidence: 0.8, requiresTeacherReview: false, diagramIds: ['diagram-1'] }], overallUncertainties: [] };
    const validGlobal = { ...invalid, criteria: [{ ...invalid.criteria[0], points: 1 }] };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalid) }, finish_reason: 'stop' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validGlobal) }, finish_reason: 'stop' }] }), { status: 200 }));
    const diagnostic = vi.fn();
    const result = await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({ ...request, onDiagnosticResult: diagnostic });
    expect(result.criteria?.[0].points).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ raw: JSON.stringify(invalid), error: expect.stringContaining('points hors barème') }));
  });

  it('rejects an empty single-page response after a targeted repair', async () => {
    const empty = { diagrams: [], criteria: [], overallUncertainties: [] };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(empty) } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(empty) } }] }), { status: 200 }));
    const diagnostic = vi.fn();
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({
      ...request,
      pageNumbers: [4],
      onDiagnosticResult: diagnostic,
    })).rejects.toThrow(/Aucun schéma exploitable/);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const initialBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(initialBody.messages[0].content).toHaveLength(2);
    expect(initialBody.messages[0].content[1].image_url.detail).toBe('high');
    expect(initialBody.messages[0].content[0].text).toContain('UNE SEULE PAGE');
    expect(initialBody.messages[0].content[0].text).toContain('CORRESPONDANCE DES PAGES : 1 → 4');
    expect(initialBody.max_tokens).toBe(2048);
    expect(repairBody.messages[0].content[0].text).toContain('cette image provient d’une page déjà classée');
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'scientific-diagram-analysis',
      raw: JSON.stringify(empty),
      requestPayload: expect.stringContaining('[IMAGE REDACTED'),
      error: expect.stringContaining('Aucun schéma exploitable'),
    }));
    const lastDiagnostic = diagnostic.mock.calls[diagnostic.mock.calls.length - 1]?.[0];
    expect(lastDiagnostic).toBeDefined();
    const effectivePayload = JSON.parse(lastDiagnostic?.requestPayload ?? '{}');
    expect(effectivePayload.model).toBe('vision-model');
    expect(effectivePayload.max_tokens).toBe(2048);
    expect(effectivePayload.messages[0].content).toHaveLength(2);
    expect(effectivePayload.messages[0].content[1].image_url.detail).toBe('high');
    expect(JSON.stringify(effectivePayload)).not.toContain('cG5n');
  });

  it('refuses multi-image analysis so callers must use the sequential application workflow', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({
      ...request,
      images: [...request.images, { base64: 'cG5nMg==', mimeType: 'image/png' }],
    })).rejects.toThrow(/une seule image par requête/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the supplied subject transcription and sends the rubric only once', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({ ...request, subjectTranscription: 'La cellule possède une membrane et un noyau.' });
    const prompt = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[0].content[0].text as string;
    expect(prompt).toContain('SUJET DE RÉFÉRENCE (transcription fournie) : La cellule possède une membrane et un noyau.');
    expect(prompt.match(/CRITÈRES VISUELS/g)).toHaveLength(1);
    expect(prompt).not.toContain('BARÈME :');
    expect(prompt).toContain('"diagramIds":["diagram-1"]');
    expect(prompt).toContain('"elements"');
  });
  it('includes the previous invalid response in the repair prompt', async () => {
    const invalid = { diagrams: [{ pageNumber: 1, diagramType: 'schéma', summary: '', uncertainties: [] }], criteria: [{ criterionId: 'labels', points: 3, evidence: 'Preuve', confidence: 0.8, requiresTeacherReview: false, diagramIds: ['diagram-1'] }], overallUncertainties: [] };
    const validGlobal = { ...invalid, criteria: [{ ...invalid.criteria[0], points: 1 }] };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalid) }, finish_reason: 'stop' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validGlobal) }, finish_reason: 'stop' }] }), { status: 200 }));
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request);
    const repairPrompt = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).messages[0].content[0].text as string;
    expect(repairPrompt).toContain('CORRECTION OBLIGATOIRE');
    expect(repairPrompt).toContain(JSON.stringify(invalid));
  });

  it('falls back to JSON object mode when a provider rejects JSON Schema format', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unsupported schema format', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(typeof firstBody.format).toBe('object');
    expect(secondBody.format).toBe('json_object');
  });

});

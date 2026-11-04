import { describe, expect, it, vi } from 'vitest';
import { createOpenAiScientificDiagramAnalyzer } from './openAiScientificDiagramAnalyzer.ts';
import { getNetworkRequestMetadata } from '../../ports/networkRequestMetadata.ts';

const request = {
  endpoint: 'https://ai.example',
  apiCompatible: true,
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
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('cG5n');
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'scientific-diagram-classification', model: 'vision-model' }));
    for (const [index, [url, init]] of fetchMock.mock.calls.entries()) {
      expect(String(url)).toBe('https://ai.example/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      expect(body.max_tokens).toBe(1024);
      expect(body.max_completion_tokens).toBeUndefined();
      expect(body.messages[0].content).toHaveLength(2);
      expect(body.messages[0].content[0].text).toContain(`classe la page ${index + 1}`);
      expect(body.messages[0].content[0].text).toContain('kind=text : texte manuscrit');
      expect(body.messages[0].content[0].text.split('\n\n')).toHaveLength(3);
      expect(body.messages[0].content[0].text).toContain('FORMAT DE SORTIE');
      expect(body.messages[0].content[0].text.split('\n\n').at(-1)).toContain('FORMAT DE SORTIE');
      expect(body.messages[0].content[0].text).toContain('orientationConfidence');
      expect(body.messages[0].content[0].text).toContain('Exemple neutre : {\"pageNumber\":1,\"kind\":\"text\"');
      expect(body.response_format.json_schema.schema.properties.kind.enum).toEqual(['text', 'scientific-diagram', 'mixed', 'ambiguous']);
      expect(body.messages[0].content[1].image_url.url).toContain(index === 0 ? 'cG5n' : 'cG5nMg==');
      expect(body.messages[0].content[1].image_url.detail).toBe('high');
    }
  });


  it('uses native Ollama chat with constrained JSON schema and a 1024-token budget', async () => {
    const nativeResponse = { message: { content: '{"pageNumber":1,"kind":"text","confidence":0.9,"reason":"texte manuscrit","suggestedRotation":0,"orientationConfidence":0.9}' }, done_reason: 'stop' };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(nativeResponse), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).classifyPages({ ...request, apiCompatible: false })).resolves.toMatchObject([{ kind: 'text', confidence: 0.9 }]);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://ai.example/api/chat');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.think).toBe(false);
    expect(body).not.toHaveProperty('keep_alive');
    expect(body.options.num_predict).toBe(1024);
    expect(body.format.properties.kind.enum).toEqual(['text', 'scientific-diagram', 'mixed', 'ambiguous']);
    expect(body.format.properties.suggestedRotation.enum).toEqual([0, 90, 180, 270]);
  });

  it('repairs malformed classification JSON once, records both attempts and does not hide the cause', async () => {
    const valid = { message: { content: '{"pageNumber":1,"kind":"text","confidence":0.9,"reason":"texte manuscrit"}' }, done_reason: 'stop' };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: '{"kind":' }, done_reason: 'stop' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(valid), { status: 200 }));
    const diagnostic = vi.fn();
    const result = await createOpenAiScientificDiagramAnalyzer(fetchMock).classifyPages({ ...request, apiCompatible: false, onDiagnosticResult: diagnostic });
    expect(result[0].kind).toBe('text');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).messages[0].content).toContain('Erreur à corriger');
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'scientific-diagram-classification', error: expect.stringContaining('JSON') }));
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'scientific-diagram-classification', raw: valid.message.content }));
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('cG5n');
  });

  it('does not retry HTTP failures during classification', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('Service unavailable', { status: 503 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).classifyPages({ ...request, apiCompatible: false })).rejects.toThrow(/HTTP 503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repairs a truncated local classification once and reports a second truncation', async () => {
    const valid = { message: { content: '{"kind":"text","confidence":0.9}' }, done_reason: 'stop' };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: '{"kind":' }, done_reason: 'length' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).classifyPages({ ...request, apiCompatible: false })).resolves.toMatchObject([{ kind: 'text' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).messages[0].content)).toContain('Réponse précédente à réparer');
  });

  it('repairs an OpenAI-compatible classification response when finish_reason is length', async () => {
    const valid = { choices: [{ message: { content: '{"kind":"text","confidence":0.9}' }, finish_reason: 'stop' }] };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"kind":' }, finish_reason: 'length' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).classifyPages({ ...request, apiCompatible: true })).resolves.toMatchObject([{ kind: 'text' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).messages[0].content[0].text).toContain('Réponse précédente à réparer');
  });



  it('retries truncated diagram analysis once with a shorter prompt, then reports a second truncation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      message: { content: '{"diagrams":' },
      done_reason: 'length',
    }), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({ ...request, apiCompatible: false }))
      .rejects.toThrow(/Réponse tronquée après une tentative allégée/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(second.messages[0].content.length).toBeLessThan(first.messages[0].content.length);
    expect(second.messages[0].content).toContain('summary ≤ 10 mots');
    expect(second.messages[0].images).toEqual(first.messages[0].images);
  });

  it('accepts a page without an identifiable diagram only with explicit uncertainty, not an invented zero', async () => {
    const result = { diagrams: [], criteria: [], overallUncertainties: ['Aucun schéma scientifique identifiable sur la page.'] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(result) }, done_reason: 'stop',
    }), { status: 200 }));
    const parsed = await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({ ...request, apiCompatible: false });
    expect(parsed).toMatchObject({ diagrams: [], criteria: [], overallUncertainties: result.overallUncertainties });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const prompt = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[0].content as string;
    expect(prompt).toContain('N’invente jamais de dessin ou de note');
  });

  it('keeps native scientific request traces image-free and labels the network intent', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(output) }, done_reason: 'stop',
    }), { status: 200 }));
    const diagnostic = vi.fn();
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({ ...request, apiCompatible: false, onDiagnosticResult: diagnostic });
    const trace = diagnostic.mock.calls.at(-1)?.[0];
    expect(trace.requestPayload).toContain('[IMAGE REDACTED]');
    expect(trace.requestPayload).not.toContain('cG5n');
    expect(trace.requestPayload).toContain('"messages"');
    expect(trace.requestMetadata).toMatchObject({ provider: 'ollama', imageCount: 1 });
    expect(getNetworkRequestMetadata(fetchMock.mock.calls[0][1])).toMatchObject({
      intent: 'Analyser les schémas scientifiques',
    });
  });

  it('uses native Ollama chat and a JSON Schema for local diagram analysis too', async () => {
    const nativeResponse = { message: { content: JSON.stringify(output) }, done_reason: 'stop' };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(nativeResponse), { status: 200 }));
    await expect(createOpenAiScientificDiagramAnalyzer(fetchMock).analyze({ ...request, apiCompatible: false }))
      .resolves.toMatchObject({ diagrams: [{ pageNumber: 1, criteria: [{ points: 2 }] }] });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://ai.example/api/chat');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.think).toBe(false);
    expect(body).not.toHaveProperty('keep_alive');
    expect(body.options.num_ctx).toBe(8192);
    expect(body.options.num_predict).toBe(2048);
    expect(body.format.properties.criteria.type).toBe('array');
    expect(body.messages[0].images[0]).toBe('cG5n');
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
  it('sends the JSON Schema through the provider format without duplicating it in the prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(request);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const prompt = body.messages[0].content[0].text as string;
    const schema = body.response_format.json_schema.schema;
    expect(prompt).not.toContain('SCHÉMA JSON À RESPECTER STRICTEMENT');
    expect(prompt).not.toContain(JSON.stringify(schema));
    expect(prompt).toContain('CRITÈRES VISUELS');
    expect(prompt.split('\\n\\n').at(-1)).toContain('FORMAT DE SORTIE');
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(schema.required).toEqual(['diagrams', 'criteria', 'overallUncertainties']);
    expect(schema.properties.diagrams.minItems).toBe(0);
    expect(schema.properties.criteria.minItems).toBe(0);
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

  it('asks Vision to evaluate only the teacher-defined subcriteria', async () => {
    const markedRequest = { ...request, rubric: { title: 'Barème', criteria: [{ id: 'labels', title: 'Schéma', description: '', maxPoints: 3, analysisMode: 'scientific-diagram' as const, subcriteria: [{ id: 'membrane', title: 'Membrane', description: 'Contour fermé', maxPoints: 2 }, { id: 'nucleus', title: 'Noyau', description: '', maxPoints: 1 }] }] } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    await createOpenAiScientificDiagramAnalyzer(fetchMock).analyze(markedRequest);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const prompt = body.messages[0].content[0].text as string;
    expect(prompt).toContain('Membrane');
    expect(prompt).toContain('Noyau');
    expect(prompt).not.toContain('arrows-relations');
    expect(prompt).not.toContain('qualityBreakdown');
    expect(prompt).toContain('ne déduis jamais automatiquement un demi-point');
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
    expect(repairBody.messages[0].content[0].text).toContain('classification préalable');
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

import { describe, expect, it, vi } from 'vitest';
import { importRubricImageWithOllama } from './ollamaProvider.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { RubricImportProgress } from '../../ports/correctionWorkspace.ts';

const image = (fileName: string): ImageInput => ({
  base64: 'aGVsbG8=',
  mimeType: 'image/png',
  fileName,
});

function response(criterionTitle = 'Membrane cellulaire') {
  return new Response(JSON.stringify({
    message: {
      content: JSON.stringify({
        title: 'Barème de biologie',
        criteria: [{ title: criterionTitle, description: 'Décrire sa fonction', maxPoints: 2 }],
      }),
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function visionResponse(content = 'Exercice 1 — Membrane cellulaire — 2 points. Attendu : décrire sa fonction.', done_reason?: string) {
  return new Response(JSON.stringify({ message: { content }, done_reason }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('rubric import progress', () => {
  it('reports sending, response, parsing and completion for one image', async () => {
    const progress: RubricImportProgress[] = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(response()) as unknown as typeof fetch;

    const result = await importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress.map((event) => event.stage)).toEqual(['sending', 'vision-reading', 'vision-reading', 'page-complete', 'structuring', 'response', 'parsing', 'complete']);
    expect(progress[0].message).toContain('vision');
    expect(progress.find((event) => event.rawResponseStage === 'vision')?.rawResponse).toContain('Membrane cellulaire');
    expect(progress.find((event) => event.rawResponseStage === 'analysis')?.rawResponse).toContain('criteria');
    expect(result.rubric.criteria).toHaveLength(1);
    expect(progress.at(-1)?.message).toContain('1 critère');
    expect(progress.find((event) => event.diagnosticRun?.kind === 'vision')?.diagnosticRun).toMatchObject({ kind: 'vision', model: 'qwen3-vl:4b' });
    expect(progress.find((event) => event.diagnosticRun?.kind === 'model')?.diagnosticRun).toMatchObject({ kind: 'model', model: 'qwen3.5:4b' });
  });

  it('applies bounded transcription options and marks a truncated rubric page as doubtful', async () => {
    const requestBodies: Array<{ options?: { temperature?: number; num_predict?: number; stop?: string[]; repeat_penalty?: number }; messages?: Array<{ content?: string }> }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as typeof requestBodies[number]);
      return requestBodies.length === 1 ? visionResponse('Exercice 1 — Membrane cellulaire.\\n\\n\\n\\n', 'length') : response();
    }) as unknown as typeof fetch;
    await importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b', transcriptionTokenLimit: 4096, transcriptionRepeatPenalty: 1.1 },
      fetchMock,
    );
    expect(requestBodies[0].options).toMatchObject({ temperature: 0, num_predict: 2048, stop: ['\\n\\n\\n\\n'], repeat_penalty: 1.1 });
    expect(requestBodies[1].messages?.[0].content).toContain('LECTURE DOUTEUSE');
    expect(requestBodies[1].messages?.[0].content).toContain('Exercice 1 — Membrane cellulaire.');
    expect(requestBodies[1].messages?.[0].content).not.toMatch(/\\n{3,}/);
  });

  it('surfaces the compatible API validation message when rubric structuring is rejected', async () => {
    const progress: RubricImportProgress[] = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(visionResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'" } }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    )).rejects.toThrow("HTTP 422 : Unsupported parameter: 'max_tokens'");

    const failedAnalysis = progress.find((event) => event.stage === 'error' && event.diagnosticRun?.kind === 'model');
    expect(failedAnalysis?.rawResponseStage).toBe('analysis');
    expect(failedAnalysis?.diagnosticRun).toMatchObject({
      kind: 'model',
      model: 'qwen3.5:4b',
      doneReason: 'http_422',
      error: "HTTP 422 : Unsupported parameter: 'max_tokens'",
    });
    expect(failedAnalysis?.diagnosticRun?.elapsedMs).toEqual(expect.any(Number));
  });

  it('keeps the exact model response visible when rubric validation fails', async () => {
    const progress: RubricImportProgress[] = [];
    const rawResponse = JSON.stringify({
      title: 'Barème de biologie',
      criteria: [{ title: '', description: 'Description présente', maxPoints: 2 }],
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      message: { content: rawResponse },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    )).rejects.toThrow('Le critère 1 doit avoir un titre');

    expect(progress.find((event) => event.stage === 'parsing' && event.rawResponseStage === 'analysis')?.rawResponse).toBe(rawResponse);
  });

  it('keeps a non-JSON model response available for diagnosis', async () => {
    const progress: RubricImportProgress[] = [];
    const rawResponse = 'Je ne peux pas extraire ce barème.';
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      message: { content: rawResponse },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    )).rejects.toThrow('La sortie du modèle d’analyse n’est pas un JSON valide');

    expect(progress.find((event) => event.stage === 'parsing' && event.rawResponseStage === 'analysis')?.rawResponse).toBe(rawResponse);
  });

  it('sends hierarchy-aware instructions for extracting scoring criteria', async () => {
    const requestBodies: Array<{ model: string; format?: unknown; messages?: Array<{ content?: string; images?: string[] }> }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as typeof requestBodies[number]);
      return requestBodies.length === 1 ? visionResponse() : response();
    }) as unknown as typeof fetch;

    await importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
    );

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0].model).toBe('qwen3-vl:4b');
    expect(requestBodies[0].messages?.[0].images).toEqual(['aGVsbG8=']);
    expect(requestBodies[0].format).toBeUndefined();
    expect(requestBodies[0].messages?.[0].content).toContain('Transcris ce qui est réellement visible');
    expect(requestBodies[1].model).toBe('qwen3.5:4b');
    expect(requestBodies[1].messages?.[0].images).toBeUndefined();
    expect(requestBodies[1].format).toBeDefined();
    const prompt = requestBodies[1].messages?.[0]?.content ?? '';
    expect(prompt).toContain('STRUCTURE :');
    expect(prompt).toContain('exercices, parties, questions, sous-questions, compétences et types d’exercice');
    expect(prompt).toContain('ne répartis jamais toi-même les points');
    expect(prompt).toContain('Distingue maximum de critère');
    expect(prompt).toContain('AUCUNE INVENTION');
    expect(prompt).toContain('Membrane cellulaire');
  });

  it('rejects a criterion whose description is empty', async () => {
    const rawResponse = JSON.stringify({
      title: 'Barème de biologie',
      criteria: [{ title: 'Membrane cellulaire', description: '   ', maxPoints: 2 }],
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(visionResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      message: { content: rawResponse },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
    )).rejects.toThrow('Le critère 1 doit avoir un titre, une description textuelle et un maximum de points positif ou nul');
  });

  it('requires a configured analysis model and does not send images without one', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(importRubricImageWithOllama(
      image('bareme.png'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b' },
      fetchMock,
    )).rejects.toThrow('Choisissez un modèle d’analyse Ollama pour structurer le barème.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports progress for each page of a multi-page PDF', async () => {
    const progress: RubricImportProgress[] = [];
    const analysisResult = new Response(JSON.stringify({ message: { content: JSON.stringify({
      title: 'Barème de biologie',
      criteria: [
        { title: 'Exercice 1 — Critère 1', description: 'Attendu page 1', maxPoints: 2 },
        { title: 'Exercice 2 — Critère 2', description: 'Attendu page 2', maxPoints: 3 },
      ],
    }) } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(visionResponse('Page 1 : Exercice 1, critère 1, 2 points.'))
      .mockResolvedValueOnce(visionResponse('Page 2 : Exercice 2, critère 2, 3 points.'))
      .mockResolvedValueOnce(analysisResult) as unknown as typeof fetch;

    const result = await importRubricImageWithOllama(
      [image('bareme.pdf · page 1'), image('bareme.pdf · page 2')],
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.rubric.criteria).toHaveLength(2);
    expect(progress.some((event) => event.stage === 'page-complete' && event.page === 1 && event.totalPages === 2)).toBe(true);
    expect(progress.some((event) => event.stage === 'page-complete' && event.page === 2 && event.totalPages === 2)).toBe(true);
    const analysisCalls = (fetchMock as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit?]> } }).mock.calls.slice(2);
    const analysisBodies = analysisCalls.map((call) => JSON.parse(String(call[1]?.body)) as { messages: Array<{ content: string; images?: string[] }> });
    expect(analysisBodies[0].messages[0].content).toContain('<transcription_page_1>');
    expect(analysisBodies[1].messages[0].content).toContain('<transcription_page_2>');
    expect(analysisBodies.every((body) => body.messages[0].images === undefined)).toBe(true);
    expect(progress.at(-1)?.stage).toBe('complete');
  });
  it('uses the documented 2048-token output ceiling and rejects a response stopped by the token limit', async () => {
    const requestBodies: Array<{ options?: { num_predict?: number } }> = [];
    const progress: RubricImportProgress[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as typeof requestBodies[number]);
      return requestBodies.length === 1
        ? visionResponse()
        : new Response(JSON.stringify({
            message: { content: '{"title":"Barème","criteria":[{"title":"Résultats","description":"Le tableau doit être' },
            done_reason: 'length',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    await expect(importRubricImageWithOllama(
      image('bareme-dix-pages.pdf · page 1'),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    )).rejects.toThrow(/limite de génération \(8192 tokens\) a été atteinte/);

    expect(requestBodies[1].options?.num_predict).toBe(2048);
    expect(progress.some((event) => event.stage === 'parsing')).toBe(false);
  });

  it('preserves the six mitosis rubric criteria and their pedagogical constraints', async () => {
    const pages = [
      'Titre : objectif du TP et méthode ; ne pas reprendre simplement le titre du TP.',
      'Introduction : définir la mitose, ses rôles et ses phases ; objectif : estimer leur durée.',
      'Introduction : présenter la méthode et les hypothèses ; ne pas donner les durées en introduction.',
      'Introduction : ne pas répondre à la problématique dans cette partie.',
      'Matériel & Méthodes : échantillon, microscope, grossissement, nombre de cellules et formule ; pas un protocole.',
      'Résultats : comptage et durées dans un tableau titré et numéroté ; pas les calculs détaillés.',
      'Résultats : exemple de tableau avec prophase, métaphase, anaphase et télophase.',
      'Résultats : présenter les résultats sans les interpréter ; discuter les écarts ensuite.',
      'Discussion : comparer théorie et expérience, expliquer les biais de comptage et proposer des améliorations.',
      'Conclusion : objectif, méthode, durées chiffrées, critiques et perspectives.',
    ];
    const criteria = [
      { title: 'Titre', description: 'Exprime l’objectif scientifique du TP et la méthode utilisée ; ne se limite pas au nom du TP.', maxPoints: 1 },
      { title: 'Introduction', description: 'Définit la mitose, ses rôles et ses phases, présente la problématique, la méthode globale et les hypothèses. Ne donne pas directement les durées des phases.', maxPoints: 3 },
      { title: 'Matériel & Méthodes', description: 'Précise l’échantillon, le microscope, les paramètres d’observation, le nombre de cellules comptées et la formule de calcul. Ne décrit pas un protocole pas à pas.', maxPoints: 2 },
      { title: 'Résultats', description: 'Présente comptages et durées dans un tableau autonome, titré et numéroté, sans détailler les calculs ni interpréter les résultats.', maxPoints: 1 },
      { title: 'Discussion', description: 'Compare résultats expérimentaux et théoriques, explique les difficultés de différenciation et les biais de comptage, puis propose des améliorations.', maxPoints: 2 },
      { title: 'Conclusion', description: 'Rappelle brièvement objectif, méthode, durées chiffrées et critiques ; ouvre sur des perspectives comme davantage de réplicats ou une autre coloration.', maxPoints: 1 },
    ];
    const progress: RubricImportProgress[] = [];
    const analysisResponse = new Response(JSON.stringify({
      message: { content: JSON.stringify({ title: 'TP5 — Mitose', criteria }) },
      done_reason: 'stop',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[0])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[1])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[2])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[3])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[4])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[5])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[6])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[7])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[8])))
      .mockImplementationOnce(() => Promise.resolve(visionResponse(pages[9])))
      .mockResolvedValueOnce(analysisResponse) as unknown as typeof fetch;

    const result = await importRubricImageWithOllama(
      pages.map((_, index) => image(`mitose.pdf · page ${index + 1}`)),
      { endpoint: 'http://localhost:11434', visionModel: 'qwen3-vl:4b', analysisModel: 'qwen3.5:4b' },
      fetchMock,
      (event) => progress.push(event),
    );

    expect(result.rubric.criteria.map((criterion) => criterion.title)).toEqual(criteria.map((criterion) => criterion.title));
    expect(result.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)).toBe(10);
    expect(result.rubric.criteria[1].description).toContain('Ne donne pas directement les durées');
    expect(result.rubric.criteria[2].description).toContain('pas à pas');
    expect(result.rubric.criteria[3].description).toContain('titré et numéroté');
    expect(result.rubric.criteria[4].description).toContain('biais de comptage');
    const analysisBody = JSON.parse(String((fetchMock as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit?]> } }).mock.calls[10][1]?.body)) as { messages: Array<{ content: string }> };
    for (let page = 1; page <= 10; page += 1) expect(analysisBody.messages[0].content).toContain(`<transcription_page_${page}>`);
    expect(progress.at(-1)?.stage).toBe('complete');
  });

});

import type { DiagramLabReport } from './diagramLabHistory.ts';

export type FixtureReport = Extract<DiagramLabReport, { format: 'companion-scientific-diagram-fixture-report' }>;
type Run = FixtureReport['cases'][number]['experiments'][number];

export function readerKey(run: Run) {
  return JSON.stringify([run.profileId, run.model, run.method, run.thinkingSetting ?? run.thinkingRequested]);
}

export function availableReaders(report: FixtureReport) {
  const readers = new Map<string, string>();
  for (const item of report.cases) for (const run of item.experiments) {
    const thinking = run.thinkingSetting ?? run.thinkingRequested;
    readers.set(readerKey(run), [run.profileName, run.model, run.method, thinking == null ? '' : 'Think ' + thinking].filter(Boolean).join(' · '));
  }
  return [...readers].map(([id, label]) => ({ id, label }));
}

interface Reading { choice: string | null; review: boolean }
function reading(run: Run, key: string): Reading {
  const obs = run.observations.find(o => o.key === key);
  const resolved = run.status === 'success' && obs && ['absent','partial','present'].includes(obs.choice);
  return { choice: resolved ? obs.choice : null, review: !resolved || Boolean(obs?.teacherReviewRequested)
    || (obs?.decisionSource === 'scored-proposal' && obs.evidenceState !== 'provided') };
}

export interface PairedDecision {
  caseId: string; repetition: number; key: string; expected: string; first: Reading; second: Reading;
}

export function pairedDecisions(left: FixtureReport, first: string, right: FixtureReport, second: string) {
  const rows: PairedDecision[] = [];
  const passages: { first: Run; second: Run; expected: number }[] = [];
  let excluded = 0;
  if (!left.protocolId || left.protocolId !== right.protocolId || left.version !== right.version)
    return { rows, passages, excluded, incompatible: true };
  for (const caseId of new Set([...left.cases, ...right.cases].map(c => c.caseId))) {
    const a = left.cases.find(c => c.caseId === caseId);
    const b = right.cases.find(c => c.caseId === caseId);
    const runsA = a?.experiments.filter(r => readerKey(r) === first) ?? [];
    const runsB = b?.experiments.filter(r => readerKey(r) === second) ?? [];
    for (const repetition of new Set([...runsA, ...runsB].map(r => r.repetition))) {
      const aa = runsA.filter(r => r.repetition === repetition);
      const bb = runsB.filter(r => r.repetition === repetition);
      if (!a?.gold || !b?.gold || aa.length !== 1 || bb.length !== 1) { excluded++; continue; }
      const keys = Object.keys(a.gold);
      if (!keys.length || keys.length !== Object.keys(b.gold).length || keys.some(k => a.gold[k] !== b.gold[k]
        || a.expectedPoints?.[k] !== b.expectedPoints?.[k])) { excluded++; continue; }
      if (a.referenceScore !== b.referenceScore) { excluded++; continue; }
      passages.push({ first:aa[0]!, second:bb[0]!, expected:a.referenceScore });
      for (const key of keys) rows.push({ caseId, repetition, key, expected: a.gold[key]!,
        first: reading(aa[0]!, key), second: reading(bb[0]!, key) });
    }
  }
  return { rows, passages, excluded, incompatible: false };
}

export function summarizeReader(rows: PairedDecision[], strategy: 'first' | 'second' | 'targeted') {
  let correct = 0, wrong = 0, missing = 0, reviews = 0, silentErrors = 0, calls = 0;
  for (const row of rows) {
    const refer = strategy === 'targeted' && row.first.review;
    const result = strategy === 'second' || refer ? row.second : row.first;
    if (refer) calls++;
    const disagree = refer && row.first.choice !== null && row.first.choice !== row.second.choice;
    const review = result.review || disagree;
    if (review) reviews++;
    if (result.choice === null) missing++;
    else if (result.choice === row.expected) correct++;
    else { wrong++; if (!review) silentErrors++; }
  }
  return { correct, wrong, missing, reviews, silentErrors, calls };
}

export function passageMetrics(passages: ReturnType<typeof pairedDecisions>['passages'], side: 'first'|'second') {
  const errors: number[] = [], times: number[] = [];
  for (const passage of passages) {
    const run = passage[side];
    if (run.status === 'success' && typeof run.score === 'number' && Number.isFinite(passage.expected))
      errors.push(Math.abs(run.score-passage.expected));
    const duration = run.clientDurationMs ?? run.durationMs;
    if (typeof duration === 'number' && Number.isFinite(duration)) times.push(duration/1000);
  }
  const mean = (values: number[]) => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;
  return { error:mean(errors), graded:errors.length, seconds:mean(times), timed:times.length };
}

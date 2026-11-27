import type { LogprobDecision, LogprobChoice } from '../../shared/domain/visualLogprobDecision.ts';
export * from '../../shared/domain/visualLogprobDecision.ts';

export interface LogprobPilotRow extends LogprobDecision {
  caseId: string;
  targetKey: string;
  expected: Exclude<LogprobChoice, 'undetermined'>;
  durationMs: number;
}
export function summarizeLogprobRows(rows: readonly LogprobPilotRow[]) {
  return {
    attempted: rows.length,
    correct: rows.filter(row => row.verdict === row.expected).length,
    resolved: rows.filter(row => row.verdict !== null && row.verdict !== 'undetermined').length,
    unavailable: rows.filter(row => row.status === 'unavailable').length,
    abstentions: rows.filter(row => row.status === 'ambiguous' || row.verdict === 'undetermined').length,
    falsePositives: rows.filter(row => row.verdict === 'present' && row.expected !== 'present').length,
    falseNegatives: rows.filter(row => row.verdict === 'absent' && row.expected !== 'absent').length,
    relativeOnly: rows.filter(row => row.relativeObservation !== undefined).length,
    relativeCorrect: rows.filter(row => row.relativeObservation?.leader === row.expected).length,
    durationMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
  };
}

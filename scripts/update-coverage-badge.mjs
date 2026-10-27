import fs from 'node:fs';

const summaryPath = 'coverage-unit/coverage-summary.json';
const badgePath = 'badges/coverage.json';
if (!fs.existsSync(summaryPath)) {
  throw new Error(`Coverage summary not found at ${summaryPath}. Run npm run test:coverage first.`);
}
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const percentage = summary.total?.lines?.pct;
if (!Number.isFinite(percentage)) {
  throw new Error('Coverage summary does not contain a valid total line percentage.');
}
const color = percentage >= 90 ? 'brightgreen'
  : percentage >= 80 ? 'green'
  : percentage >= 65 ? 'yellow'
  : percentage >= 50 ? 'orange'
  : 'red';
fs.mkdirSync('badges', { recursive: true });
fs.writeFileSync(badgePath, JSON.stringify({
  schemaVersion: 1,
  label: 'couverture lignes (Vitest)',
  message: `${percentage}%`,
  color,
}, null, 2) + '\n');
console.log(`Coverage badge updated: ${percentage}% (${color}).`);

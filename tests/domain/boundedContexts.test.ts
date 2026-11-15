import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const domain = fileURLToPath(new URL('../../src/', import.meta.url));
const correction = resolve(domain, 'correction');
const evaluation = resolve(domain, 'evaluation');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function dependencies(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  const imports = source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+)['"]/g);
  return Array.from(imports, ([, fileName]) => resolve(dirname(path), fileName));
}

it('keeps correction independent of evaluation, including indirect and type-only imports', () => {
  const visited = new Set<string>();
  function visit(path: string, chain: string[]) {
    if (visited.has(path)) return;
    visited.add(path);
    for (const target of dependencies(path)) {
      const route = [...chain, relative(domain, target)];
      expect(target.startsWith(evaluation + sep), route.join(' → ')).toBe(false);
      if (path.startsWith(resolve(correction, 'domain') + sep)) {
        expect(target.startsWith(resolve(correction, 'domain') + sep) || target.startsWith(resolve(domain, 'shared/domain') + sep), route.join(' → ')).toBe(true);
      }
      if (/\.tsx?$/.test(target)) visit(target, route);
    }
  }
  for (const path of sourceFiles(correction)) visit(path, [relative(domain, path)]);
});

it.each([
  [evaluation, correction],
  [correction, evaluation],
])('requires the public entry point for cross-context imports from %s to %s', (source, other) => {
  const api = resolve(other, 'api/index.ts');
  for (const path of sourceFiles(source)) {
    for (const target of dependencies(path)) {
      if (target.startsWith(other + sep)) {
        expect(target, relative(domain, path)).toBe(api);
      }
      expect(target.startsWith(resolve(domain, 'shell') + sep), relative(domain, path)).toBe(false);
    }
  }
});

it('keeps the common foundation independent of features and the composition shell', () => {
  for (const path of sourceFiles(resolve(domain, 'shared'))) {
    for (const target of dependencies(path)) {
      expect(target.startsWith(resolve(domain, 'shared') + sep), relative(domain, path)).toBe(true);
    }
  }
});

it('documents each published grading event from correction to evaluation on the context map', () => {
  const contract = readFileSync(resolve(correction, 'api/gradingOutcome.ts'), 'utf8');
  const events = Array.from(contract.matchAll(/readonly type:\s*'([^']+)'/g), match => match[1]);
  const architecture = readFileSync(resolve(domain, '../docs/architecture.md'), 'utf8');
  const diagram = architecture.match(/### Carte des contextes\s+[\s\S]*?```mermaid\s+([\s\S]*?)```/)?.[1] ?? '';
  const deliveries = Array.from(diagram.matchAll(/correction\s+-\.->\|"([^"]+)"\|\s+evaluation\b/g), match => match[1]);
  expect(events.length).toBeGreaterThan(0);
  expect(deliveries.sort()).toEqual(events.sort());
});

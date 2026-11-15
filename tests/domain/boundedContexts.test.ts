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

it('routes evaluation imports of correction through its published contract', () => {
  const contract = resolve(correction, 'domain/contract.ts');
  for (const path of sourceFiles(evaluation)) {
    for (const dependency of dependencies(path)) {
      if (dependency.startsWith(correction + sep)) {
        expect([contract, resolve(correction, 'events/gradingOutcome.ts')], relative(domain, path)).toContain(dependency);
      }
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

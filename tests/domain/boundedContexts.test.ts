import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const domain = fileURLToPath(new URL('../../src/domain/', import.meta.url));
const correction = resolve(domain, 'correction');
const evaluation = resolve(domain, 'evaluation');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

it('keeps correction independent of evaluation, including indirect and type-only imports', () => {
  const visited = new Set<string>();
  function visit(path: string, chain: string[]) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    const imports = source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+)['"]/g);
    for (const [, fileName] of imports) {
      const target = resolve(dirname(path), fileName);
      const route = [...chain, relative(domain, target)];
      expect(target.startsWith(evaluation + sep), route.join(' → ')).toBe(false);
      expect(target.startsWith(resolve(domain) + sep), route.join(' → ')).toBe(true);
      visit(target.endsWith('.ts') ? target : target + '.ts', route);
    }
  }
  for (const path of sourceFiles(correction)) visit(path, [relative(domain, path)]);
});

"""Fail CI when a versioned test would silently escape its runner."""
import json
from pathlib import Path
import re
import subprocess
import sys


def discovery_errors(tracked, vitest, playwright):
    errors = []
    for path in sorted(tracked):
        if re.search(r'\.(test|spec)\.[cm]?[jt]sx?$', path):
            if path.startswith('tests/e2e/') and path.endswith('.spec.ts'):
                runner, discovered = 'Playwright', playwright
            elif path.startswith('tests/') and not path.startswith('tests/e2e/') and path.endswith(('.test.ts', '.test.tsx')):
                runner, discovered = 'Vitest', vitest
            else:
                errors.append(f'{path} : placer les tests Vitest dans tests/ et les .spec.ts Playwright dans tests/e2e/.')
                continue
            if path not in discovered:
                errors.append(f'{path} : fichier absent de la collecte {runner}.')
        elif re.fullmatch(r'(?:.*/)?(?:test_.*|.*_test)\.py', path):
            if not re.fullmatch(r'tests/python/test_[^/]+\.py', path):
                errors.append(f'{path} : unittest découvre tests/python/test_*.py.')
    return errors


def main():
    root = Path(__file__).resolve().parents[1]

    def output(*command):
        return subprocess.check_output(command, cwd=root, text=True)

    tracked = output('git', 'ls-files', '-z').split('\0')
    vitest = json.loads(output('node', 'node_modules/vitest/vitest.mjs', 'list', '--filesOnly', '--json'))
    playwright = json.loads(output('node', 'node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json'))
    # Playwright reports test files relative to the configured rootDir.
    e2e_root = Path(playwright['config']['rootDir'])
    collected_specs = {(e2e_root / suite['file']).relative_to(root).as_posix() for suite in playwright['suites']}
    collected_units = {Path(item['file']).relative_to(root).as_posix() for item in vitest}
    errors = discovery_errors(tracked, collected_units, collected_specs)
    if errors:
        sys.exit('\n'.join(errors))
    print(f'{len(collected_units)} suites Vitest et {len(collected_specs)} suites Playwright découvertes.')


if __name__ == '__main__':
    main()

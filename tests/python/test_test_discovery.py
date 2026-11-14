import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from check_test_discovery import discovery_errors


class TestDiscoveryTests(unittest.TestCase):
    def test_accepts_the_three_runners(self):
        unit, ui, e2e = 'tests/domain/score.test.ts', 'tests/ui/Score.test.tsx', 'tests/e2e/review.spec.ts'
        tracked = [unit, ui, e2e, 'tests/python/test_launcher.py', 'src/domain/score.ts']
        self.assertEqual(discovery_errors(tracked, {unit, ui}, {e2e}), [])

    def test_names_each_misplaced_or_undiscovered_file(self):
        paths = ['src/ui/Score.test.tsx', 'tests/e2e/review.test.ts', 'scripts/test_launcher.py',
                 'tests/python/launcher_test.py', 'tests/domain/ignored.test.ts', 'tests/e2e/ignored.spec.ts']
        errors = discovery_errors(paths, set(), set())
        self.assertEqual({message.split(' :')[0] for message in errors}, set(paths))

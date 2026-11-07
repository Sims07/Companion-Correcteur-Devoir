"""Tests du protocole : aucun moteur ni réseau local requis."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('benchmark_prompt_cache', Path(__file__).with_name('benchmark_prompt_cache.py'))
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)


class PromptCacheBenchmarkTests(unittest.TestCase):
    def test_identical_prompts_and_shared_prefix_are_fictitious(self):
        tests = bench.scenarios()
        self.assertEqual(len(tests['identique']), 3)
        self.assertEqual(len(set(tests['identique'])), 1)
        self.assertEqual(len(set(tests['prefixe_commun'])), 3)
        self.assertGreater(bench.common_prefix_chars(tests['prefixe_commun']), 700)
        self.assertIn('transcription_etudiant', tests['prefixe_commun'][0])
        self.assertEqual(bench.common_prefix_chars(['bonjour', 'bonjour']), 7)
        self.assertEqual(bench.common_prefix_chars([]), 0)

    def test_llama_cache_true_false_only_difference_is_cache_flag(self):
        off = bench.llama_payload('Test', False)
        on = bench.llama_payload('Test', True)
        self.assertIs(off['cache_prompt'], False)
        self.assertIs(on['cache_prompt'], True)
        self.assertEqual({k: v for k, v in off.items() if k != 'cache_prompt'},
                         {k: v for k, v in on.items() if k != 'cache_prompt'})
        self.assertEqual(bench.ollama_payload('qwen3.5:4b', 'Test')['options']['num_gpu'], 0)
        self.assertTrue(bench.ollama_payload('qwen3.5:4b', 'Test')['raw'])

    def test_ollama_includes_real_cache_counter_if_present(self):
        result = bench.summarize_ollama({
            'eval_count': 64, 'eval_duration': 8_000_000_000,
            'prompt_eval_count': 330, 'prompt_eval_cached_count': 250,
            'prompt_eval_duration': 1_000_000_000, 'load_duration': 100_000_000,
            'response': 'Réponse fictive',
        }, 9.2)
        self.assertEqual(result['output_tok_s'], 8)
        self.assertEqual(result['cached_input_tokens'], 250)
        self.assertEqual(result['input_eval_ms'], 1000)
        self.assertEqual(result['wall_ms'], 9200)
        self.assertNotIn('Réponse fictive', json.dumps(result))
        self.assertIsNone(bench.summarize_ollama({
            'eval_count': 64, 'eval_duration': 8_000_000_000,
        }, 1)['cached_input_tokens'])

    def test_llama_input_eval_is_reported_without_claiming_cache_hit(self):
        r = bench.summarize_llama({
            'content': 'Sensible', 'timings': {'predicted_n': 96, 'predicted_ms': 12000,
                                                   'prompt_n': 20, 'prompt_ms': 5.5},
        }, 12.3)
        self.assertEqual(r['output_tok_s'], 8)
        self.assertEqual(r['input_tokens_evaluated'], 20)
        self.assertNotIn('cached_input_tokens', r)
        self.assertNotIn('Sensible', json.dumps(r))

    def test_invalid_missing_counters_fail_loudly(self):
        with self.assertRaises(ValueError):
            bench.summarize_llama({'content': 'hello'}, 1)
        with self.assertRaises(ValueError):
            bench.summarize_ollama({'response': 'hello'}, 1)

    def test_requires_the_exact_gguf_from_ollama_modelfile(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'blob'
            file.write_bytes(b'GGUF' + b'123456')
            self.assertEqual(bench.find_ollama_gguf({'modelfile': f'FROM {file}\nPARAMETER num_ctx 2048'}), file)
            file.write_bytes(b'NOPE')
            with self.assertRaises(RuntimeError):
                bench.find_ollama_gguf({'modelfile': f'FROM {file}'})

    def test_report_is_json_and_no_student_text_or_home_path_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(bench, 'OUTPUT', Path(tmp) / 'report.json'):
                data = {'results': {'llama_cache_on': {'identique': [bench.summarize_llama({
                    'content': 'copie interdite', 'timings': {'predicted_n': 2, 'predicted_ms': 1}
                }, 1)]}}}
                bench.write_report(data)
                actual = Path(tmp, 'report.json').read_text(encoding='utf-8')
                self.assertNotIn('copie interdite', actual)
                self.assertIn('llama_cache_on', json.loads(actual)['results'])


if __name__ == '__main__':
    unittest.main()

"""Tests du maintien en éveil des lanceurs HTTPS macOS, sans modifier l'énergie système."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
LM_LAUNCHER = ROOT / "tools/lmstudio-https-mac/Demarrer-Companion-LMStudio-HTTPS-Sans-Veille.command"
OLLAMA_LAUNCHER = ROOT / "tools/ollama-https-mac/Demarrer-Compagnon-Ollama-HTTPS.command"


class MacHttpsKeepAwakeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="compagnon https ")
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.bin = self.folder / "bin"
        self.bin.mkdir()
        self.wrapper = self.folder / LM_LAUNCHER.name
        shutil.copyfile(LM_LAUNCHER, self.wrapper)
        self.original = self.folder / "Demarrer-Companion-LMStudio-HTTPS.command"
        self.caffeinate_log = self.folder / "caffeinate-arguments.txt"
        self.env = dict(
            os.environ,
            PATH=str(self.bin) + os.pathsep + os.environ.get("PATH", ""),
            HOME=str(self.folder),
            CAFFEINATE_LOG=str(self.caffeinate_log),
        )
        self.shim("uname", "#!/bin/sh\nprintf 'Darwin\\n'\n")
        self.shim("caffeinate", """#!/bin/bash
printf '%s\\n' "$@" > "$CAFFEINATE_LOG"
shift 2
exec "$@"
""")

    def shim(self, name, content):
        path = self.bin / name
        path.write_text(content, encoding="utf-8")
        path.chmod(0o755)

    def run_launcher(self, launcher=None, *args):
        return subprocess.run(
            ["/bin/bash", str(launcher or self.wrapper), *args],
            cwd=self.folder, env=self.env, text=True, capture_output=True, timeout=10,
        )

    def test_missing_original_fails_without_starting_caffeinate(self):
        proc = self.run_launcher()
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("introuvable", proc.stderr)
        self.assertIn("Demarrer-Companion-LMStudio-HTTPS.command", proc.stderr)
        self.assertFalse(self.caffeinate_log.exists())

    def test_mac_launches_under_caffeinate_and_waits_until_proxy_finishes(self):
        ready = self.folder / "ready"
        done = self.folder / "done"
        self.original.write_text(
            '#!/bin/bash\nprintf ready > "$READY_FILE"\nsleep 0.5\nprintf done > "$DONE_FILE"\n',
            encoding="utf-8",
        )
        env = dict(self.env, READY_FILE=str(ready), DONE_FILE=str(done))
        proc = subprocess.Popen(
            ["/bin/bash", str(self.wrapper)],
            env=env, cwd=self.folder, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            deadline = time.monotonic() + 4
            while not ready.exists() and proc.poll() is None and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue(ready.exists(), "le lanceur HTTPS original doit démarrer")
            self.assertIsNone(proc.poll(), "la protection doit suivre la durée du lanceur")
            stdout, stderr = proc.communicate(timeout=5)
            self.assertEqual(proc.returncode, 0, stderr)
            self.assertTrue(done.exists())
            self.assertIn("Mac maintenu eveille", stdout)
            args = self.caffeinate_log.read_text(encoding="utf-8").splitlines()
            self.assertEqual(args, ["-i", "-s", "/bin/bash", str(self.original)])
            self.assertNotIn("-d", args, "l'écran doit pouvoir s'éteindre")
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.communicate(timeout=5)

    def test_arguments_are_forwarded_to_original_launcher(self):
        received = self.folder / "args.txt"
        self.original.write_text(
            '#!/bin/bash\nprintf "%s\\n" "$@" > "$RECEIVED"\n', encoding="utf-8",
        )
        proc = subprocess.run(
            ["/bin/bash", str(self.wrapper), "avec espace", "--option"],
            env=dict(self.env, RECEIVED=str(received)),
            cwd=self.folder, text=True, capture_output=True, timeout=5,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(received.read_text(encoding="utf-8").splitlines(), ["avec espace", "--option"])

    def test_non_mac_fallback_does_not_require_caffeinate(self):
        self.shim("uname", "#!/bin/sh\nprintf 'Linux\\n'\n")
        self.original.write_text('#!/bin/bash\nprintf "proxy actif\\n"\n', encoding="utf-8")
        proc = self.run_launcher()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("proxy actif", proc.stdout)
        self.assertFalse(self.caffeinate_log.exists())

    def test_ollama_launcher_uses_caffeinate_on_mac(self):
        fake_python_log = self.folder / "python-args.txt"
        self.shim("python3", '#!/bin/bash\nprintf "%s\\n" "$@" > "$FAKE_PYTHON_LOG"\n')
        proc = subprocess.run(
            ["/bin/bash", str(OLLAMA_LAUNCHER)],
            env=dict(self.env, COMPAGNON_HTTPS_HOME=str(self.folder),
                     FAKE_PYTHON_LOG=str(fake_python_log)),
            text=True, capture_output=True, timeout=5,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        args = self.caffeinate_log.read_text(encoding="utf-8").splitlines()
        self.assertEqual(args[:2], ["-i", "-s"])
        self.assertEqual(Path(args[2]), self.bin / "python3")
        self.assertEqual(args[3:], ["-u", str(self.folder / "serveur_https.py")])
        self.assertEqual(fake_python_log.read_text(encoding="utf-8").splitlines(),
                         ["-u", str(self.folder / "serveur_https.py")])

    def test_ollama_linux_fallback_runs_without_caffeinate(self):
        self.shim("uname", "#!/bin/sh\nprintf 'Linux\\n'\n")
        fake_python_log = self.folder / "python-args.txt"
        self.shim("python3", '#!/bin/bash\nprintf "%s\\n" "$@" > "$FAKE_PYTHON_LOG"\n')
        proc = subprocess.run(
            ["/bin/bash", str(OLLAMA_LAUNCHER)],
            env=dict(self.env, COMPAGNON_HTTPS_HOME=str(self.folder),
                     FAKE_PYTHON_LOG=str(fake_python_log)),
            text=True, capture_output=True, timeout=5,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(fake_python_log.exists())
        self.assertFalse(self.caffeinate_log.exists())


if __name__ == "__main__":
    unittest.main()

"""Tests sans Ollama réel ni certificat provenant d'une machine."""
import http.client
import os
import json
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LAUNCHER = Path(__file__).with_name('Demarrer-Compagnon-Ollama-HTTPS.command')
source = LAUNCHER.read_text(encoding='utf-8')
server_python = source.split("<<'COMPAGNON_SERVEUR_PYTHON'\n", 1)[1].split('\nCOMPAGNON_SERVEUR_PYTHON', 1)[0]
proxy = types.ModuleType('companion_proxy')
exec(compile(server_python, str(LAUNCHER), 'exec'), proxy.__dict__)


class FakeOllama(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == '/api/version':
            payload = b'{"version":"test"}'
        elif self.path == '/api/tags':
            payload = b'{"models":[{"name":"modele-test"}]}'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        self.send_response(200)
        if self.path == '/api/chat':
            self.send_header('Content-Type', 'application/x-ndjson')
            self.end_headers()
            self.wfile.write(b'{"token":"premier"}\n')
            self.wfile.flush()
            time.sleep(0.7)
            self.wfile.write(b'{"done":true}\n')
            self.wfile.flush()
        else:
            result = json.dumps({'size': len(body), 'authorization': self.headers.get('Authorization')}).encode()
            self.send_header('Content-Length', str(len(result)))
            self.end_headers()
            self.wfile.write(result)


class OllamaHTTPSProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        base = Path(cls.tmp.name)
        cls.root = base
        key, cert, _ = proxy.prepare_certificates(base, ['192.168.1.25'], 'mac-test.local')
        cls.ollama = ThreadingHTTPServer(('127.0.0.1', 0), FakeOllama)
        cls.old_port = proxy.OLLAMA_PORT
        proxy.OLLAMA_PORT = cls.ollama.server_port
        cls.ollama_thread = threading.Thread(target=cls.ollama.serve_forever, daemon=True)
        cls.ollama_thread.start()
        cls.http = proxy.TLSServer(('127.0.0.1', 0), proxy.ProxyHandler)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(cert), str(key))
        cls.http.socket = ctx.wrap_socket(cls.http.socket, server_side=True)
        cls.client_ctx = ssl.create_default_context(cafile=str(base/'ca.pem'))
        cls.http_thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.http_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.ollama.shutdown()
        cls.http.server_close()
        cls.ollama.server_close()
        proxy.OLLAMA_PORT = cls.old_port
        cls.tmp.cleanup()

    def call(self, method, path, headers=None, body=None):
        client = http.client.HTTPSConnection('localhost', self.http.server_port, context=self.client_ctx, timeout=5)
        client.request(method, path, body=body, headers=headers or {})
        res = client.getresponse()
        answer = res.status, dict(res.getheaders()), res.read()
        client.close()
        return answer

    def test_certificate_contains_localhost_and_example_lan_ip(self):
        details = subprocess.check_output(['openssl', 'x509', '-in', str(self.root/'server.pem'), '-text', '-noout'], text=True)
        self.assertIn('DNS:localhost', details)
        self.assertIn('IP Address:127.0.0.1', details)
        self.assertIn('IP Address:192.168.1.25', details)
        self.assertIn('DNS:mac-test.local', details)
        self.assertEqual((self.root / 'ca.key').stat().st_mode & 0o777, 0o600)

    def test_cors_preflight_and_blocked_origin(self):
        allowed = {'Origin': 'https://sims07.github.io', 'Access-Control-Request-Headers': 'authorization,content-type', 'Access-Control-Request-Private-Network': 'true'}
        status, headers, _ = self.call('OPTIONS', '/api/chat', allowed)
        self.assertEqual(status, 204)
        self.assertEqual(headers['Access-Control-Allow-Origin'], allowed['Origin'])
        self.assertEqual(headers['Access-Control-Allow-Private-Network'], 'true')
        self.assertIn('authorization', headers['Access-Control-Allow-Headers'])
        for method in ('OPTIONS', 'GET', 'POST'):
            status, headers, _ = self.call(method, '/api/tags', {'Origin': 'https://malveillant.example'})
            self.assertEqual(status, 403)
            self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_ollama_discovery_health_and_filtered_paths(self):
        status, _, data = self.call('GET', '/api/tags', {'Origin': 'https://sims07.github.io'})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)['models'][0]['name'], 'modele-test')
        self.assertEqual(self.call('GET', '/healthz')[0], 200)
        self.assertEqual(self.call('GET', '/')[0], 200)
        self.assertEqual(self.call('GET', '/secret')[0], 404)

    def test_post_openai_compatible_passes_body_and_headers(self):
        payload = b'{"prompt":"test","images":[]}'
        status, _, result = self.call('POST', '/v1/chat/completions', {'Origin': 'https://sims07.github.io', 'Authorization': 'Bearer exemple'}, payload)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(result)['size'], len(payload))
        self.assertEqual(json.loads(result)['authorization'], 'Bearer exemple')

    def test_streaming_is_delivered_before_completion(self):
        client = http.client.HTTPSConnection('localhost', self.http.server_port, context=self.client_ctx, timeout=5)
        client.request('POST', '/api/chat', body='{}', headers={'Origin': 'https://sims07.github.io'})
        res = client.getresponse()
        start = time.monotonic()
        chunk = res.read1(512)
        elapsed = time.monotonic() - start
        self.assertEqual(res.status, 200)
        self.assertIn(b'premier', chunk)
        self.assertLess(elapsed, 0.6, 'le flux ne doit pas attendre la fin de la génération')
        self.assertIn(b'"done":true', res.read())
        client.close()

    @unittest.skipUnless(__import__('sys').platform != 'darwin', 'intégration sans accès au trousseau dans la CI Linux')
    def test_one_click_launcher_starts_https_proxy(self):
        with tempfile.TemporaryDirectory() as tmp:
            listener = socket.socket()
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
            listener.close()
            env = dict(os.environ, HOME=tmp, COMPAGNON_HTTPS_HOME=tmp,
                       COMPAGNON_HTTPS_PORT=str(port), COMPAGNON_OLLAMA_PORT=str(self.ollama.server_port))
            proc = subprocess.Popen(['bash', str(LAUNCHER)], env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            try:
                for _ in range(70):
                    if proc.poll() is not None:
                        self.fail(f'lanceur arrêté prématurément : {proc.stderr.read()}')
                    if (Path(tmp)/'ca.pem').exists():
                        try:
                            ctx = ssl.create_default_context(cafile=str(Path(tmp)/'ca.pem'))
                            conn = http.client.HTTPSConnection('localhost', port, context=ctx, timeout=.3)
                            conn.request('GET', '/api/tags', headers={'Origin': 'https://sims07.github.io'})
                            res = conn.getresponse()
                            result = res.read()
                            self.assertEqual(res.status, 200)
                            self.assertIn(b'modele-test', result)
                            conn.close()
                            break
                        except (OSError, ssl.SSLError):
                            pass
                    time.sleep(.1)
                else:
                    self.fail('le lanceur n’a pas démarré le serveur HTTPS')
            finally:
                proc.terminate()
                proc.wait(timeout=5)
                proc.stderr.close()

    def test_body_size_limit_and_no_certificate_in_repository(self):
        status, _, _ = self.call('POST', '/api/chat', {'Content-Length': str(129*1024*1024)})
        self.assertEqual(status, 413)
        self.assertNotIn('-----BEGIN PRIVATE KEY-----', source)
        self.assertNotIn('-----BEGIN CERTIFICATE-----', source)


if __name__ == '__main__':
    unittest.main()

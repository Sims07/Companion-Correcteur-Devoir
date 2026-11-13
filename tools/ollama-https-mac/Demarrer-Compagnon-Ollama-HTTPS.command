#!/bin/bash
# Double-cliquer dans le Finder : lance Ollama derrière un HTTPS local.
# Aucune dépendance externe autre que Python 3 (déjà utilisé sur ce Mac) et OpenSSL macOS.
set -eu
umask 077

printf '\n  COMPAGNON — DEMARRAGE HTTPS POUR OLLAMA\n'
printf '  =====================================\n\n'

PYTHON_BIN="$(command -v python3 || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo "Erreur : Python 3 est introuvable sur ce Mac."
  echo "Installe Python 3 puis relance ce fichier."
  read -r -p "Appuie sur Entree pour fermer… " _
  exit 1
fi

DOSSIER="$HOME/Library/Application Support/Compagnon-Ollama-HTTPS"
mkdir -p "$DOSSIER"
chmod 700 "$DOSSIER"

# Le serveur est inclus dans ce .command (aucun autre fichier à télécharger).
cat > "$DOSSIER/serveur_https.py" <<'COMPAGNON_SERVEUR_PYTHON'
#!/usr/bin/env python3
"""Serveur HTTPS local devant Ollama pour Companion Correcteur Devoir.

Bibliothèque standard Python uniquement. Aucun service cloud ni tunnel.
"""
from __future__ import annotations

import http.client
import html
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import urlsplit

PORT = int(os.environ.get("COMPAGNON_HTTPS_PORT", "11435"))
OLLAMA_HOST = "127.0.0.1"
OLLAMA_PORT = int(os.environ.get("COMPAGNON_OLLAMA_PORT", "11434"))
ROOT_DIR = Path(os.environ.get("COMPAGNON_HTTPS_HOME", str(Path.home() / "Library" / "Application Support" / "Compagnon-Ollama-HTTPS")))
DEFAULT_ORIGINS = (
    "https://sims07.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost:5173",
    "https://127.0.0.1:5173",
)
EXTRA_ORIGINS = tuple(x.strip() for x in os.environ.get("COMPAGNON_ORIGINES_SUPPLEMENTAIRES", "").split(",") if x.strip())
ALLOWED_ORIGINS = frozenset((*DEFAULT_ORIGINS, *EXTRA_ORIGINS))
MAX_BODY_SIZE = 128 * 1024 * 1024
HOP_BY_HOP_HEADERS = frozenset(
    ("connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
     "transfer-encoding", "upgrade", "host")
)


def local_ipv4() -> list[str]:
    addresses: list[str] = []
    # L'interface de la route par défaut est généralement le Wi-Fi ou l'Ethernet utilisé.
    if sys.platform == "darwin":
        route = subprocess.run(["/sbin/route", "-n", "get", "default"], capture_output=True, text=True, check=False)
        match = re.search(r"^\s*interface:\s*(\S+)", route.stdout, flags=re.MULTILINE)
        if match:
            ipcfg = subprocess.run(["/usr/sbin/ipconfig", "getifaddr", match.group(1)], capture_output=True, text=True, check=False)
            addresses.append(ipcfg.stdout.strip())
    ifconfig = shutil.which("ifconfig") or "/sbin/ifconfig"
    if Path(ifconfig).exists():
        output = subprocess.run([ifconfig], capture_output=True, text=True, check=False).stdout
        addresses.extend(re.findall(r"^\s*inet\s+(\d+\.\d+\.\d+\.\d+)\b", output, flags=re.MULTILINE))
    try:
        addresses.extend(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    result: list[str] = []
    for candidate in addresses:
        try:
            addr = ipaddress.IPv4Address(candidate)
            # Ne pas exposer d'IP publique ni locale de bouclage parmi les URLs suggérées.
            if not addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_unspecified:
                continue
            if candidate not in result:
                result.append(candidate)
        except ipaddress.AddressValueError:
            pass
    return result


def local_hostname() -> Optional[str]:
    if sys.platform != "darwin":
        return None
    result = subprocess.run(["/usr/sbin/scutil", "--get", "LocalHostName"], capture_output=True, text=True, check=False)
    name = result.stdout.strip()
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,62}", name):
        return f"{name}.local"
    return None


def run_command(*args: str) -> None:
    result = subprocess.run(args, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"Échec de {' '.join(args[:2])} : {result.stderr.strip() or result.stdout.strip()}")


def prepare_certificates(folder: Path, ips: list[str], hostname: Optional[str]) -> tuple[Path, Path, Path]:
    folder.mkdir(parents=True, exist_ok=True)
    folder.chmod(0o700)
    root_key, root_pem = folder / "ca.key", folder / "ca.pem"
    root_der = folder / "Compagnon-Ollama-CA.cer"
    leaf_key, leaf_pem = folder / "server.key", folder / "server.pem"
    openssl = shutil.which("openssl") or "/usr/bin/openssl"
    if not Path(openssl).exists():
        raise RuntimeError("OpenSSL est introuvable sur ce Mac.")
    if not root_key.exists() or not root_pem.exists():
        # Une CA stable : l'iPhone ne doit pas réinstaller le certificat après chaque lancement.
        ca_conf = folder / "ca.cnf"
        ca_conf.write_text("""[req]
        distinguished_name = dn
        prompt = no
        x509_extensions = v3_ca
        [dn]
        CN = Compagnon Ollama CA locale
        [v3_ca]
        basicConstraints = critical, CA:TRUE
        keyUsage = critical, keyCertSign, cRLSign
        subjectKeyIdentifier = hash
        """, encoding="utf-8")
        run_command(openssl, "req", "-new", "-x509", "-sha256", "-days", "3650", "-nodes", "-newkey", "rsa:3072",
                    "-keyout", str(root_key), "-out", str(root_pem), "-config", str(ca_conf))
    root_key.chmod(0o600)
    run_command(openssl, "x509", "-in", str(root_pem), "-outform", "DER", "-out", str(root_der))
    conf = folder / "server.cnf"
    alt_names = ["DNS.1 = localhost", "IP.1 = 127.0.0.1"]
    if hostname:
        alt_names.append(f"DNS.2 = {hostname}")
    for idx, ip in enumerate(ips, start=2):
        alt_names.append(f"IP.{idx} = {ip}")
    conf.write_text("\n".join([
        "[req]", "distinguished_name = dn", "prompt = no", "req_extensions = v3_req", "[dn]",
        "CN = localhost", "[v3_req]", "basicConstraints = CA:FALSE",
        "keyUsage = critical, digitalSignature, keyEncipherment", "extendedKeyUsage = serverAuth",
        "subjectAltName = @alt_names", "[alt_names]", *alt_names, "",
    ]), encoding="utf-8")
    csr = folder / "server.csr"
    run_command(openssl, "req", "-new", "-sha256", "-nodes", "-newkey", "rsa:2048",
                "-keyout", str(leaf_key), "-out", str(csr), "-config", str(conf))
    run_command(openssl, "x509", "-req", "-in", str(csr), "-CA", str(root_pem), "-CAkey", str(root_key),
                "-CAcreateserial", "-out", str(leaf_pem), "-days", "397", "-sha256",
                "-extfile", str(conf), "-extensions", "v3_req")
    leaf_key.chmod(0o600)
    run_command(openssl, "verify", "-CAfile", str(root_pem), str(leaf_pem))
    return leaf_key, leaf_pem, root_der


def install_mac_trust(folder: Path) -> bool:
    if sys.platform != "darwin":
        return False
    marker = folder / ".certificat_mac_installe"
    if marker.exists():
        return True
    keychain = Path.home() / "Library" / "Keychains" / "login.keychain-db"
    print("🔐 Installation du certificat de confiance dans le trousseau macOS (une seule fois)…", flush=True)
    result = subprocess.run(["/usr/bin/security", "add-trusted-cert", "-d", "-r", "trustRoot", "-k",
                             str(keychain), str(folder / "ca.pem")], capture_output=True, text=True, check=False)
    if result.returncode:
        print("⚠️  L'ajout automatique au trousseau a échoué.")
        print("    Ouvre « Trousseaux d'accès » et ajoute ca.pem comme certificat toujours approuvé.")
        print("    Détail :", (result.stderr or result.stdout).strip(), flush=True)
        return False
    marker.write_text("Certificat racine ajouté à la session macOS.\n", encoding="utf-8")
    return True


def ollama_available() -> bool:
    try:
        conn = http.client.HTTPConnection(OLLAMA_HOST, OLLAMA_PORT, timeout=2)
        conn.request("GET", "/api/version")
        resp = conn.getresponse()
        resp.read()
        conn.close()
        return resp.status == 200
    except (OSError, http.client.HTTPException):
        return False


def ensure_ollama(folder: Path) -> Optional[subprocess.Popen]:
    if ollama_available():
        print("✓ Ollama déjà actif : conservé tel quel.", flush=True)
        return None
    if sys.platform == "darwin":
        print("Démarrage de l'application Ollama…", flush=True)
        subprocess.run(["/usr/bin/open", "-a", "Ollama"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        for _ in range(10):
            if ollama_available():
                print("✓ Ollama démarré.", flush=True)
                return None
            time.sleep(1)
    executable = shutil.which("ollama")
    if not executable:
        for candidate in ("/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", "/Applications/Ollama.app/Contents/Resources/ollama"):
            if os.access(candidate, os.X_OK):
                executable = candidate
                break
    if executable:
        print("Lancement du serveur Ollama en arrière-plan…", flush=True)
        env = dict(os.environ, OLLAMA_HOST=f"127.0.0.1:{OLLAMA_PORT}")
        log = (folder / "ollama-demarrage.log").open("ab")
        process = subprocess.Popen([executable, "serve"], env=env, stdout=log, stderr=subprocess.STDOUT)
        log.close()
        for _ in range(12):
            if ollama_available():
                print("✓ Ollama actif.", flush=True)
                return process
            if process.poll() is not None:
                break
            time.sleep(1)
        process.terminate()
    raise RuntimeError(f"Ollama ne répond pas sur http://127.0.0.1:{OLLAMA_PORT}. Lance Ollama avant de réessayer.")


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"  # réponse par fermeture : compatible flux Ollama NDJSON/SSE
    server_version = "CompagnonOllamaHTTPS/1.0"
    sys_version = ""

    def log_message(self, format: str, *args: object) -> None:
        # Confidentialité : ne journaliser ni copies, ni prompts, ni réponses.
        return

    def _allowed_origin(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or origin in ALLOWED_ORIGINS

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin and origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin, Access-Control-Request-Headers")
            self.send_header("Access-Control-Expose-Headers", "Content-Type, Content-Length")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _respond(self, status: int, data: bytes, content_type: str = "application/json; charset=utf-8") -> None:
        self.send_response(status)
        self._cors_headers()
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _json_error(self, status: int, message: str) -> None:
        self._respond(status, json.dumps({"error": message}).encode("utf-8"))

    def do_OPTIONS(self) -> None:
        if not self._allowed_origin():
            self._json_error(403, "Origine non autorisée")
            return
        self.send_response(204)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
        requested = self.headers.get("Access-Control-Request-Headers", "")
        # Une origine autorisée peut envoyer les en-têtes nécessaires à Ollama et /v1.
        self.send_header("Access-Control-Allow-Headers", requested or "Authorization, Content-Type, Accept, X-Requested-With")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        self._proxy()

    def do_HEAD(self) -> None:
        self._proxy()

    def do_POST(self) -> None:
        self._proxy()

    def do_PUT(self) -> None:
        self._proxy()

    def do_PATCH(self) -> None:
        self._proxy()

    def do_DELETE(self) -> None:
        self._proxy()

    def _proxy(self) -> None:
        if not self._allowed_origin():
            self._json_error(403, "Origine non autorisée : utiliser la PWA Compagnon autorisée")
            return
        url = urlsplit(self.path)
        if self.command == "GET" and url.path == "/":
            page_html = ("<!doctype html><html lang='fr'><meta charset='utf-8'><meta name='viewport' content='width=device-width'>"
                    "<title>Compagnon — Ollama HTTPS</title><style>body{font:17px system-ui;max-width:670px;margin:9vh auto;padding:24px;line-height:1.6}"
                    "h1{font-size:1.5rem}code{background:#eee;padding:4px;border-radius:4px}</style>"
                    "<h1>✅ Compagnon — serveur Ollama HTTPS opérationnel</h1>"
                    "<p>Le proxy est local. Les requêtes de la PWA sont transmises uniquement à Ollama sur ce Mac.</p>"
                    "<p>URL de configuration : <code>" + html.escape(f"https://{self.headers.get('Host', 'localhost:' + str(PORT))}") + "</code></p>"
                    "<p><a href='/api/tags'>Vérifier les modèles Ollama</a> · <a href='/healthz'>Vérifier le serveur</a></p></html>")
            self._respond(200, page_html.encode("utf-8"), "text/html; charset=utf-8")
            return
        if self.command == "GET" and url.path == "/healthz":
            self._respond(200 if ollama_available() else 503,
                          json.dumps({"https": "ok", "ollama": "ok" if ollama_available() else "indisponible"}).encode("utf-8"))
            return
        if not (url.path.startswith("/api/") or url.path.startswith("/v1/")) or url.scheme or url.netloc:
            self._json_error(404, "Route non autorisée")
            return
        if "Transfer-Encoding" in self.headers:
            self._json_error(501, "Requêtes entrantes fragmentées non prises en charge")
            return
        headers_sent = False
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > MAX_BODY_SIZE:
                self._json_error(413, "Corps de requête trop volumineux (128 Mio maximum)")
                return
            body = self.rfile.read(length) if length else None
            request_headers = {
                k: v for k, v in self.headers.items()
                if k.lower() not in HOP_BY_HOP_HEADERS
                and k.lower() not in ("origin", "content-length", "accept-encoding")
            }
            request_headers["Host"] = f"{OLLAMA_HOST}:{OLLAMA_PORT}"
            request_headers["Accept-Encoding"] = "identity"
            # httplib fournit Content-Length si le corps est présent.
            conn = http.client.HTTPConnection(OLLAMA_HOST, OLLAMA_PORT, timeout=3600)
            try:
                conn.request(self.command, self.path, body=body, headers=request_headers)
                response = conn.getresponse()
                self.send_response(response.status)
                self._cors_headers()
                self.send_header("Cache-Control", "no-store")
                for key, value in response.getheaders():
                    if key.lower() not in HOP_BY_HOP_HEADERS and not key.lower().startswith("access-control-") and key.lower() != "cache-control":
                        self.send_header(key, value)
                self.end_headers()
                headers_sent = True
                if self.command == "HEAD":
                    return
                while True:
                    chunk = response.read1(4096)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()  # streaming : pas d'attente de fin de génération
            finally:
                conn.close()
        except (BrokenPipeError, ConnectionResetError):
            # L'arrêt côté PWA interrompt aussitôt le flux Ollama amont.
            pass
        except (OSError, http.client.HTTPException, ValueError) as exc:
            try:
                if not headers_sent:
                    self._json_error(502, f"Impossible de joindre Ollama : {type(exc).__name__}")
            except OSError:
                pass


class TLSServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 64


def main() -> int:
    print("=" * 62)
    print("  COMPAGNON — OLLAMA EN HTTPS POUR SAFARI")
    print("=" * 62)
    print("Proxy vers Ollama local uniquement ; pas de tunnel Internet.\n")
    ips = local_ipv4()
    hostname = local_hostname()
    key, cert, root_cert = prepare_certificates(ROOT_DIR, ips, hostname)
    install_mac_trust(ROOT_DIR)
    ensure_ollama(ROOT_DIR)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(str(cert), str(key))
    try:
        server = TLSServer(("0.0.0.0", PORT), ProxyHandler)
    except OSError as exc:
        raise RuntimeError(f"Le port {PORT} est déjà occupé : serveur déjà lancé ? ({exc})") from exc
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    print("\n✅ HTTPS prêt :")
    print(f"  • Safari sur ce Mac : https://localhost:{PORT}")
    for ip in ips:
        print(f"  • Safari sur le réseau : https://{ip}:{PORT}")
    if hostname:
        print(f"  • Nom du Mac : https://{hostname}:{PORT} (si mDNS disponible)")
    print("\n  Origine PWA autorisée : https://sims07.github.io")
    print(f"  Certificat CA pour iPhone : {root_cert}")
    print("\n  Choisir l'une de ces URLs comme serveur Ollama dans la PWA (sans /api).")
    print("  Mac et iPhone doivent être sur le même réseau privé.")
    print("  Pour arrêter : Ctrl+C dans cette fenêtre.\n", flush=True)
    if sys.platform == "darwin" and not os.environ.get("COMPAGNON_NE_PAS_OUVRIR_SAFARI"):
        subprocess.run(["/usr/bin/open", "-a", "Safari", f"https://localhost:{PORT}/"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print("\nArrêt du proxy HTTPS. Ollama reste disponible.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"\n❌ {exc}", file=sys.stderr, flush=True)
        if sys.stdin.isatty():
            input("Appuie sur Entrée pour fermer cette fenêtre…")
        raise SystemExit(1)
COMPAGNON_SERVEUR_PYTHON
chmod 600 "$DOSSIER/serveur_https.py"
exec "$PYTHON_BIN" -u "$DOSSIER/serveur_https.py"

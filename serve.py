#!/usr/bin/env python3
"""Ditherland - servidor de dev local. Serve ./site em http://127.0.0.1:8765/.

Projeto standalone (extraido do mirror em 2026-06). Codigo proprio LBK, sem
dependencia de servidores externos.

Uso:
    python serve.py [porta] [--open]
        porta   : padrao 8765
        --open  : abre o navegador na pagina inicial
"""
import os
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE, "site")

args = sys.argv[1:]
OPEN = "--open" in args
args = [a for a in args if not a.startswith("--")]
PORT = int(args[0]) if args else 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *a):
        return

    def end_headers(self):
        # Dev server: nunca cachear, para que cada edicao apareca no refresh.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    if not os.path.isdir(ROOT):
        print(f"ERRO: pasta nao encontrada: {ROOT}")
        sys.exit(1)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print("=" * 52)
    print("  DITHERLAND")
    print("=" * 52)
    print(f"  Servindo : {ROOT}")
    print(f"  URL      : {url}")
    print("  Parar    : feche a janela ou Ctrl+C")
    print("=" * 52)
    if OPEN:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        server.shutdown()


if __name__ == "__main__":
    main()

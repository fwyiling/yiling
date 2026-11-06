#!/usr/bin/env python3
"""
Local proxy server for messenger.abeto.co
Run:  python server.py
Then open:  http://localhost:8765
"""

import http.server
import urllib.request
import urllib.error
import os
import sys

PORT = 8765
UPSTREAM = "https://messenger.abeto.co"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

CONTENT_TYPES = {
    ".js":    "text/javascript",
    ".mjs":   "text/javascript",
    ".css":   "text/css",
    ".html":  "text/html",
    ".png":   "image/png",
    ".jpg":   "image/jpeg",
    ".jpeg":  "image/jpeg",
    ".gif":   "image/gif",
    ".svg":   "image/svg+xml",
    ".avif":  "image/avif",
    ".webp":  "image/webp",
    ".ogg":   "audio/ogg",
    ".mp3":   "audio/mpeg",
    ".wav":   "audio/wav",
    ".mp4":   "video/mp4",
    ".wasm":  "application/wasm",
    ".json":  "application/json",
    ".bin":   "application/octet-stream",
    ".drc":   "application/octet-stream",
    ".ktx2":  "application/octet-stream",
    ".glb":   "model/gltf-binary",
    ".gltf":  "model/gltf+json",
    ".woff":  "font/woff",
    ".woff2": "font/woff2",
    ".ico":   "image/x-icon",
}

CORS_HEADERS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"),
    ("Access-Control-Allow-Headers", "*"),
    ("Cross-Origin-Embedder-Policy", "require-corp"),
    ("Cross-Origin-Opener-Policy", "same-origin"),
]


def guess_content_type(path):
    _, ext = os.path.splitext(path.split("?")[0].lower())
    return CONTENT_TYPES.get(ext, "application/octet-stream")


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    def send_cors(self):
        for k, v in CORS_HEADERS:
            self.send_header(k, v)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_HEAD(self):
        self._proxy(head_only=True)

    def do_GET(self):
        # Serve local index.html at root
        if self.path in ("/", "/index.html"):
            self._serve_local("index.html", "text/html")
            return
        self._proxy()

    def _serve_local(self, filename, content_type):
        filepath = os.path.join(SCRIPT_DIR, filename)
        try:
            with open(filepath, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_cors()
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_error(404, f"{filename} not found")

    def _proxy(self, head_only=False):
        path = self.path
        url = f"{UPSTREAM}{path}"

        req = urllib.request.Request(url, method="HEAD" if head_only else "GET")
        req.add_header("User-Agent", "Mozilla/5.0")
        req.add_header("Referer", UPSTREAM)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status = resp.status
                data = b"" if head_only else resp.read()
                content_type = resp.headers.get("Content-Type", guess_content_type(path))

                # Patch absolute CDN URLs in JS bundles so workers load locally
                if "javascript" in content_type and not head_only:
                    text = data.decode("utf-8", errors="replace")
                    text = text.replace(UPSTREAM, "")
                    data = text.encode("utf-8")

                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_cors()
                # Pass through cache headers
                for h in ("Cache-Control", "ETag", "Last-Modified"):
                    v = resp.headers.get(h)
                    if v:
                        self.send_header(h, v)
                self.end_headers()
                if not head_only:
                    self.wfile.write(data)

        except urllib.error.HTTPError as e:
            self.send_error(e.code, str(e.reason))
        except urllib.error.URLError as e:
            self.send_error(502, f"Upstream error: {e.reason}")
        except Exception as e:
            self.send_error(500, str(e))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = http.server.ThreadingHTTPServer(("", port), ProxyHandler)
    print(f"Messenger running at  http://localhost:{port}")
    print(f"Proxying assets from  {UPSTREAM}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

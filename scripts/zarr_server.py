#!/usr/bin/env python3
"""
Simple HTTP server with CORS support for serving Zarr pyramids.
Serves files at /zarr/ prefix for frontend compatibility.
"""

import http.server
import socketserver
from pathlib import Path
import json

PORT = 8000
DIRECTORY = Path(__file__).parent.parent / "data" / "pyramids"


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def translate_path(self, path):
        """Strip /zarr/ prefix if present."""
        if path.startswith('/zarr/'):
            path = path[5:]  # Remove '/zarr' prefix, keep leading /
        elif path == '/zarr':
            path = '/'
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        """Handle GET requests - serve root info or files."""
        if self.path == '/':
            # Return API info JSON
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            info = {
                "status": "ok",
                "message": "Zarr pyramid server",
                "endpoints": {
                    "zarr": "/zarr/<dataset>/<level>"
                }
            }
            self.wfile.write(json.dumps(info).encode())
            return
        super().do_GET()


if __name__ == "__main__":
    # Use SO_REUSEADDR to avoid "Address already in use" errors
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print(f"Serving Zarr pyramids from: {DIRECTORY}")
        print(f"Server running at: http://localhost:{PORT}")
        print(f"Access data at: http://localhost:{PORT}/zarr/<dataset>/<level>")
        print("Press Ctrl+C to stop")
        httpd.serve_forever()

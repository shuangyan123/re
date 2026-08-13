"""Minimal cross-language Tutor Benchmark integration example.

Integration example only: this is not a benchmark score baseline or a tutor
implementation intended for production use.
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class TutorHandler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path != "/respond":
            self.send_error(404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(content_length))
            if not isinstance(request, dict):
                raise ValueError("Request body must be a JSON object")
            student_message = request.get("currentStudentMessage", "")
        except (ValueError, json.JSONDecodeError):
            self.send_error(400, "Request must be valid JSON")
            return

        response = {
            "text": (
                "Start with one small step from the student message: "
                f"{student_message}"
            )
        }
        encoded = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format, *args):  # noqa: A002 - standard library hook
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), TutorHandler)
    print("HTTP Tutor example listening at http://127.0.0.1:8000/respond")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
